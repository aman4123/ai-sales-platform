import { Router } from "express";
import { z } from "zod";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";

const leadStatuses = [
  "INTERESTED",
  "MEETING",
  "FOLLOW_UP",
  "PROPOSAL_SENT",
  "CLOSED",
  "LOST",
] as const;

const leadInputSchema = z.object({
  company: z.string().trim().min(1).max(160),
  contact: z.string().trim().min(1).max(160),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  phone: z.string().trim().max(40).optional(),
  industry: z.string().trim().max(120).optional(),
  status: z.enum(leadStatuses).default("INTERESTED"),
  value: z.coerce.number().finite().min(0).max(9_999_999_999_999.99),
  notes: z.string().trim().max(5_000).optional(),
});

const updateLeadSchema = leadInputSchema.partial().refine((input) => Object.keys(input).length > 0, {
  message: "At least one field must be provided.",
});

const idSchema = z.string().min(1).max(64);

const listQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.enum(leadStatuses).optional(),
});

function cleanOptional(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

function serializeLead<T extends { value: { toString(): string } }>(lead: T) {
  return { ...lead, value: lead.value.toString() };
}

export function createLeadRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/", async (request, response) => {
    const query = listQuerySchema.parse(request.query);
    const leads = await database.lead.findMany({
      where: {
        userId: request.user!.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { company: { contains: query.search, mode: "insensitive" } },
                { contact: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    response.json({ data: { leads: leads.map(serializeLead) } });
  });

  router.post("/", async (request, response) => {
    const input = leadInputSchema.parse(request.body);
    const email = cleanOptional(input.email);
    const phone = cleanOptional(input.phone);
    const industry = cleanOptional(input.industry);
    const notes = cleanOptional(input.notes);
    const lead = await database.lead.create({
      data: {
        userId: request.user!.id,
        company: input.company,
        contact: input.contact,
        status: input.status,
        value: input.value,
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(industry !== undefined ? { industry } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });

    response.status(201).json({ data: { lead: serializeLead(lead) } });
  });

  router.put("/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = updateLeadSchema.parse(request.body);
    const existing = await database.lead.findFirst({
      where: { id, userId: request.user!.id },
      select: { id: true },
    });

    if (!existing) throw new NotFoundError("Lead");

    const email = cleanOptional(input.email);
    const phone = cleanOptional(input.phone);
    const industry = cleanOptional(input.industry);
    const notes = cleanOptional(input.notes);

    const lead = await database.lead.update({
      where: { id },
      data: {
        ...(input.company !== undefined ? { company: input.company } : {}),
        ...(input.contact !== undefined ? { contact: input.contact } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(industry !== undefined ? { industry } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });

    response.json({ data: { lead: serializeLead(lead) } });
  });

  router.delete("/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const deleted = await database.lead.deleteMany({
      where: { id, userId: request.user!.id },
    });

    if (deleted.count === 0) throw new NotFoundError("Lead");
    if (deleted.count > 1) {
      throw new AppError(500, "DELETE_INVARIANT", "More than one lead matched a unique identifier.");
    }

    response.status(204).send();
  });

  return router;
}
