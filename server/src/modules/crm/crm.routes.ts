import { Router } from "express";
import { z } from "zod";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";

const optionalUrl = z.union([z.string().trim().url().max(2_000), z.literal("")]).optional();
const optionalEmail = z.union([z.string().trim().toLowerCase().email().max(254), z.literal("")]).optional();
const companySchema = z.object({
  name: z.string().trim().min(1).max(160),
  legalName: z.string().trim().max(200).optional(),
  website: optionalUrl,
  industry: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2_000).optional(),
  headquarters: z.string().trim().max(300).optional(),
});
const contactSchema = z
  .object({
    companyId: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(160),
    jobTitle: z.string().trim().max(160).optional(),
    publicEmail: optionalEmail,
    publicPhone: z.string().trim().max(40).optional(),
    linkedInUrl: optionalUrl,
    publicSourceUrl: optionalUrl,
    verificationStatus: z.enum(["UNVERIFIED", "PARTIALLY_VERIFIED"]).default("UNVERIFIED"),
  })
  .superRefine((input, context) => {
    const hasPublicContact = Boolean(input.publicEmail || input.publicPhone || input.linkedInUrl);
    if (hasPublicContact && !input.publicSourceUrl) {
      context.addIssue({
        code: "custom",
        path: ["publicSourceUrl"],
        message: "A public source URL is required for professional contact details.",
      });
    }
  });
const dealSchema = z.object({
  companyId: z.string().min(1).max(64).optional(),
  contactId: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200),
  stage: z.enum(["QUALIFYING", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]),
  value: z.coerce.number().finite().min(0).max(9_999_999_999_999.99),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("USD"),
  expectedAt: z.coerce.date().optional(),
});
const activitySchema = z.object({
  companyId: z.string().min(1).max(64).optional(),
  contactId: z.string().min(1).max(64).optional(),
  dealId: z.string().min(1).max(64).optional(),
  type: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(1_000),
  occurredAt: z.coerce.date().optional(),
});
const noteSchema = z
  .object({
    leadId: z.string().min(1).max(64).optional(),
    companyId: z.string().min(1).max(64).optional(),
    contactId: z.string().min(1).max(64).optional(),
    dealId: z.string().min(1).max(64).optional(),
    body: z.string().trim().min(1).max(5_000),
  })
  .refine((value) => [value.leadId, value.companyId, value.contactId, value.dealId].filter(Boolean).length === 1, {
    message: "A note must belong to exactly one CRM resource.",
  });
const listSchema = z.object({
  search: z.string().trim().max(160).optional(),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
});
const importSchema = z.object({
  companies: z.array(companySchema).max(500).default([]),
  contacts: z.array(contactSchema).max(500).default([]),
});

function emptyToNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function domainFromWebsite(website: string | undefined) {
  if (!website) return null;
  return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
}

async function assertOwnedRelations(
  database: DatabaseClient,
  userId: string,
  input: {
    companyId?: string | undefined;
    contactId?: string | undefined;
    dealId?: string | undefined;
    leadId?: string | undefined;
  },
) {
  const checks = await Promise.all([
    input.companyId
      ? database.company.findFirst({ where: { id: input.companyId, userId, deletedAt: null }, select: { id: true } })
      : true,
    input.contactId
      ? database.contact.findFirst({ where: { id: input.contactId, userId, deletedAt: null }, select: { id: true } })
      : true,
    input.dealId
      ? database.deal.findFirst({ where: { id: input.dealId, userId, deletedAt: null }, select: { id: true } })
      : true,
    input.leadId
      ? database.lead.findFirst({ where: { id: input.leadId, userId }, select: { id: true } })
      : true,
  ]);
  if (checks.some((result) => !result)) throw new NotFoundError("CRM resource");
}

export function createCrmRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/companies", async (request, response) => {
    const query = listSchema.parse(request.query);
    const companies = await database.company.findMany({
      where: {
        userId: request.user!.id,
        deletedAt: null,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { legalName: { contains: query.search, mode: "insensitive" as const } },
                { domain: { contains: query.search, mode: "insensitive" as const } },
                { industry: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy:
        query.sort === "name"
          ? [{ name: "asc" }, { id: "asc" }]
          : [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { contacts: true, leads: true, deals: true } } },
    });
    const hasMore = companies.length > query.limit;
    const page = hasMore ? companies.slice(0, query.limit) : companies;
    response.json({ data: { companies: page, nextCursor: hasMore ? page.at(-1)!.id : null } });
  });

  router.post("/companies", async (request, response) => {
    const input = companySchema.parse(request.body);
    const domain = domainFromWebsite(input.website);
    if (domain) {
      const duplicate = await database.company.findUnique({
        where: { userId_domain: { userId: request.user!.id, domain } },
      });
      if (duplicate) {
        throw new AppError(409, "COMPANY_DUPLICATE", "A company with this domain already exists.");
      }
    }
    const company = await database.company.create({
      data: {
        userId: request.user!.id,
        name: input.name,
        legalName: emptyToNull(input.legalName),
        website: emptyToNull(input.website),
        domain,
        industry: emptyToNull(input.industry),
        description: emptyToNull(input.description),
        headquarters: emptyToNull(input.headquarters),
        riskFlags: ["USER_PROVIDED_REQUIRES_CONFIRMATION"],
      },
    });
    response.status(201).json({ data: { company } });
  });

  router.get("/contacts", async (request, response) => {
    const query = listSchema.parse(request.query);
    const contacts = await database.contact.findMany({
      where: {
        userId: request.user!.id,
        deletedAt: null,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { jobTitle: { contains: query.search, mode: "insensitive" as const } },
                { publicEmail: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { company: true },
    });
    const hasMore = contacts.length > query.limit;
    const page = hasMore ? contacts.slice(0, query.limit) : contacts;
    response.json({ data: { contacts: page, nextCursor: hasMore ? page.at(-1)!.id : null } });
  });

  router.post("/contacts", async (request, response) => {
    const input = contactSchema.parse(request.body);
    await assertOwnedRelations(database, request.user!.id, input);
    const email = emptyToNull(input.publicEmail);
    if (email) {
      const duplicate = await database.contact.findUnique({
        where: { userId_publicEmail: { userId: request.user!.id, publicEmail: email } },
      });
      if (duplicate) throw new AppError(409, "CONTACT_DUPLICATE", "A contact with this email already exists.");
    }
    const contact = await database.contact.create({
      data: {
        userId: request.user!.id,
        companyId: input.companyId ?? null,
        name: input.name,
        jobTitle: emptyToNull(input.jobTitle),
        publicEmail: email,
        publicPhone: emptyToNull(input.publicPhone),
        linkedInUrl: emptyToNull(input.linkedInUrl),
        publicSourceUrl: emptyToNull(input.publicSourceUrl),
        verificationStatus: input.verificationStatus,
      },
    });
    response.status(201).json({ data: { contact } });
  });

  router.get("/deals", async (request, response) => {
    const query = listSchema.parse(request.query);
    const deals = await database.deal.findMany({
      where: {
        userId: request.user!.id,
        deletedAt: null,
        ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
      },
      orderBy: [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { company: true, contact: true },
    });
    const hasMore = deals.length > query.limit;
    const page = hasMore ? deals.slice(0, query.limit) : deals;
    response.json({
      data: {
        deals: page.map((deal) => ({ ...deal, value: deal.value.toString() })),
        nextCursor: hasMore ? page.at(-1)!.id : null,
      },
    });
  });

  router.post("/deals", async (request, response) => {
    const input = dealSchema.parse(request.body);
    await assertOwnedRelations(database, request.user!.id, input);
    const deal = await database.deal.create({
      data: {
        userId: request.user!.id,
        name: input.name,
        stage: input.stage,
        value: input.value,
        currency: input.currency,
        companyId: input.companyId ?? null,
        contactId: input.contactId ?? null,
        expectedAt: input.expectedAt ?? null,
      },
    });
    response.status(201).json({ data: { deal: { ...deal, value: deal.value.toString() } } });
  });

  router.get("/activities", async (request, response) => {
    const query = listSchema.parse(request.query);
    const activities = await database.crmActivity.findMany({
      where: {
        userId: request.user!.id,
        ...(query.search ? { summary: { contains: query.search, mode: "insensitive" } } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = activities.length > query.limit;
    const page = hasMore ? activities.slice(0, query.limit) : activities;
    response.json({ data: { activities: page, nextCursor: hasMore ? page.at(-1)!.id : null } });
  });

  router.post("/activities", async (request, response) => {
    const input = activitySchema.parse(request.body);
    await assertOwnedRelations(database, request.user!.id, input);
    const activity = await database.crmActivity.create({
      data: {
        userId: request.user!.id,
        type: input.type,
        summary: input.summary,
        companyId: input.companyId ?? null,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    response.status(201).json({ data: { activity } });
  });

  router.post("/notes", async (request, response) => {
    const input = noteSchema.parse(request.body);
    await assertOwnedRelations(database, request.user!.id, input);
    const note = await database.note.create({
      data: {
        userId: request.user!.id,
        body: input.body,
        leadId: input.leadId ?? null,
        companyId: input.companyId ?? null,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
      },
    });
    response.status(201).json({ data: { note } });
  });

  router.post("/import/validate", async (request, response) => {
    const input = importSchema.parse(request.body);
    const domains = input.companies.map((company) => domainFromWebsite(company.website)).filter(Boolean) as string[];
    const emails = input.contacts.map((contact) => emptyToNull(contact.publicEmail)).filter(Boolean) as string[];
    const [existingCompanies, existingContacts] = await Promise.all([
      database.company.findMany({
        where: { userId: request.user!.id, domain: { in: domains } },
        select: { domain: true },
      }),
      database.contact.findMany({
        where: { userId: request.user!.id, publicEmail: { in: emails } },
        select: { publicEmail: true },
      }),
    ]);
    const duplicateDomains = new Set(existingCompanies.map((item) => item.domain));
    const duplicateEmails = new Set(existingContacts.map((item) => item.publicEmail));
    response.json({
      data: {
        valid: duplicateDomains.size === 0 && duplicateEmails.size === 0,
        companies: input.companies.length,
        contacts: input.contacts.length,
        duplicateDomains: [...duplicateDomains],
        duplicateEmails: [...duplicateEmails],
        writesPerformed: false,
      },
    });
  });

  return router;
}
