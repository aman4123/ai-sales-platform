import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { EmailService } from "../../lib/email.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { replaceAccountToken } from "../auth/auth.security.js";
import { isMasterAccount } from "../auth/auth.tokens.js";
import { searchProviderConfiguration } from "../research/search.providers.js";
import { ensurePersonalTenant, tenantScope, tenantWrite } from "../tenancy/tenant.service.js";

const idSchema = z.string().trim().min(1).max(64);
const adminListSchema = z.object({
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const systemStatusRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  tenantId: idSchema.optional(),
  tenantRole: z.enum([
    "TENANT_ADMIN",
    "SALES_MANAGER",
    "SALES_USER",
    "REVIEWER",
    "BILLING_ADMIN",
    "VIEWER",
  ]).default("SALES_USER"),
});
const updateUserSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
  role: z.enum(["USER", "MEMBER", "ADMIN"]).optional(),
  tenantRole: z.enum([
    "TENANT_ADMIN",
    "SALES_MANAGER",
    "SALES_USER",
    "REVIEWER",
    "BILLING_ADMIN",
    "VIEWER",
  ]).optional(),
  verified: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one account change.");
const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  ownerUserId: idSchema.optional(),
  planCode: z.enum([
    "FREE_TRIAL",
    "STARTER",
    "GROWTH",
    "BUSINESS",
    "ENTERPRISE",
    "CUSTOM",
    "INTERNAL",
    "LIFETIME",
  ]).default("FREE_TRIAL"),
});
const tenantStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]),
  reason: z.string().trim().min(5).max(500),
  confirm: z.literal(true),
});
const budgetSchema = z.object({
  mode: z.enum(["DISABLED", "LIMITED", "INTERNAL_UNLIMITED"]),
  monthlyRequestLimit: z.number().int().min(0).max(1_000_000),
  warningThresholdPercent: z.number().int().min(1).max(100).default(80),
  reason: z.string().trim().min(5).max(500),
  confirm: z.literal(true),
}).superRefine((value, context) => {
  if (value.mode === "LIMITED" && value.monthlyRequestLimit < 1) {
    context.addIssue({
      code: "custom",
      path: ["monthlyRequestLimit"],
      message: "Limited mode requires a positive monthly request limit.",
    });
  }
  if (value.mode !== "LIMITED" && value.monthlyRequestLimit !== 0) {
    context.addIssue({
      code: "custom",
      path: ["monthlyRequestLimit"],
      message: "Disabled and internal-unlimited modes use a zero stored limit.",
    });
  }
});
const subscriptionSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  status: z.enum(["TRIAL", "ACTIVE", "PAUSED", "CANCELLED", "SUSPENDED"]),
  trialEndsAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(5).max(500),
  confirm: z.literal(true),
});
const planSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]+$/).max(40),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1_000).default(""),
  monthlyPriceMinor: z.number().int().min(0).max(1_000_000_000).nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  userLimit: z.number().int().min(1).max(100_000),
  leadLimit: z.number().int().min(0).max(100_000_000),
  campaignLimit: z.number().int().min(0).max(1_000_000),
  aiMonthlyRequestLimit: z.number().int().min(0).max(1_000_000),
  researchMonthlyLimit: z.number().int().min(0).max(1_000_000),
  storageLimitMb: z.number().int().min(1).max(10_000_000),
  features: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  reason: z.string().trim().min(5).max(500),
  confirm: z.literal(true),
});
const featureFlagSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]*$/).max(120),
  scope: z.enum(["GLOBAL", "TENANT", "USER"]),
  tenantId: idSchema.optional(),
  userId: idSchema.optional(),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100).default(100),
  reason: z.string().trim().min(5).max(500),
  confirm: z.literal(true),
}).superRefine((value, context) => {
  if (value.scope === "GLOBAL" && (value.tenantId || value.userId)) {
    context.addIssue({ code: "custom", path: ["scope"], message: "Global flags cannot name a tenant or user." });
  }
  if (value.scope === "TENANT" && (!value.tenantId || value.userId)) {
    context.addIssue({ code: "custom", path: ["tenantId"], message: "Tenant flags require only a tenant ID." });
  }
  if (value.scope === "USER" && (!value.userId || value.tenantId)) {
    context.addIssue({ code: "custom", path: ["userId"], message: "User flags require only a user ID." });
  }
});
const jobActionSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  confirm: z.literal(true),
});
const supportSessionSchema = z.object({
  targetUserId: idSchema,
  tenantId: idSchema,
  accessLevel: z.enum(["READ_ONLY", "WRITE"]),
  reason: z.string().trim().min(10).max(500),
  durationMinutes: z.number().int().min(5).max(60).default(15),
  confirm: z.literal(true),
});

function assertMasterAdmin(request: Request) {
  if (
    !request.user || !isMasterAccount(request.user.accountRole)
    || request.user.accessMode !== "MASTER_ADMIN"
  ) {
    throw new AppError(
      403,
      "MASTER_ADMIN_REQUIRED",
      "Switch to Master Admin mode before changing platform accounts or limits.",
    );
  }
}

function verificationUrl(token: string) {
  const url = new URL("/verify-email", env.APP_BASE_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

function passwordResetUrl(token: string) {
  const url = new URL("/reset-password", env.APP_BASE_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

function metadataFingerprint(value: string | null) {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : null;
}

export function createAdminRouter(
  database: DatabaseClient,
  emailService?: EmailService,
  redis: RedisClient | null = null,
) {
  const router = Router();

  router.post("/demo-data", async (request, response) => {
    if (!request.user || !isMasterAccount(request.user.accountRole) || request.user.accessMode !== "TESTER") {
      throw new AppError(
        403,
        "TESTER_MODE_REQUIRED",
        "Switch to Tester Mode before loading isolated demo data.",
      );
    }
    if (request.tenant?.kind !== "TEST") {
      throw new AppError(409, "TEST_WORKSPACE_REQUIRED", "Tester Mode requires the isolated test workspace.");
    }
    const tenant = request.tenant;
    const userId = request.user.id;
    const result = await database.$transaction(async (transaction) => {
      const company = await transaction.company.upsert({
        where: { tenantId_domain: { tenantId: tenant.id, domain: "northstar-logistics.demo.invalid" } },
        create: {
          userId,
          tenantId: tenant.id,
          name: "Northstar Logistics (Demo)",
          domain: "northstar-logistics.demo.invalid",
          industry: "Logistics",
          description: "Clearly labeled tester data for exercising V2 workflows.",
          confidenceScore: 0,
          riskFlags: ["TEST_DATA", "NOT_VERIFIED"],
        },
        update: {},
      });
      const contact = await transaction.contact.upsert({
        where: { tenantId_publicEmail: { tenantId: tenant.id, publicEmail: "jordan@northstar.demo.invalid" } },
        create: {
          userId,
          tenantId: tenant.id,
          companyId: company.id,
          name: "Jordan Lee (Demo)",
          jobTitle: "Operations Lead (Demo)",
          publicEmail: "jordan@northstar.demo.invalid",
          verificationStatus: "UNVERIFIED",
        },
        update: { companyId: company.id },
      });
      const existingLead = await transaction.lead.findFirst({
        where: { ...tenantScope(tenant, userId), companyRecordId: company.id, contactRecordId: contact.id },
      });
      const lead = existingLead ?? await transaction.lead.create({
        data: {
          userId,
          ...tenantWrite(tenant),
          company: company.name,
          contact: contact.name,
          email: contact.publicEmail,
          industry: company.industry,
          status: "INTERESTED",
          notes: "Tester Mode demo record. Do not use for real outreach.",
          companyRecordId: company.id,
          contactRecordId: contact.id,
          riskFlags: ["TEST_DATA", "NOT_VERIFIED"],
        },
      });
      const existingDeal = await transaction.deal.findFirst({
        where: { ...tenantScope(tenant, userId), companyId: company.id, contactId: contact.id, name: "Demo workflow review" },
      });
      const deal = existingDeal ?? await transaction.deal.create({
        data: {
          userId,
          ...tenantWrite(tenant),
          companyId: company.id,
          contactId: contact.id,
          name: "Demo workflow review",
          stage: "QUALIFYING",
          value: 0,
          currency: "USD",
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: userId,
          tenantId: tenant.id,
          action: "TESTER_DEMO_DATA_READY",
          resourceType: "TesterWorkspace",
          requestId: request.id,
          metadata: { companyId: company.id, contactId: contact.id, leadId: lead.id, dealId: deal.id },
        },
      });
      return { companyId: company.id, contactId: contact.id, leadId: lead.id, dealId: deal.id };
    });
    response.status(201).json({ data: { ...result, isolatedToUserId: userId } });
  });

  router.get("/users", async (request, response) => {
    assertMasterAdmin(request);
    const query = adminListSchema.parse(request.query);
    const users = await database.user.findMany({
      ...(query.search
        ? {
            where: {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { email: { contains: query.search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        status: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
        deletedAt: true,
        tenantMemberships: {
          select: {
            role: true,
            tenant: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
        _count: { select: { sessions: true, aiRequests: true, campaigns: true } },
      },
    });
    response.json({ data: { users } });
  });

  router.post("/users", async (request, response) => {
    assertMasterAdmin(request);
    const input = createUserSchema.parse(request.body);
    const existing = await database.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, "ACCOUNT_EXISTS", "An account with this email already exists.");
    }
    if (input.tenantId) {
      const tenant = await database.tenant.findFirst({
        where: { id: input.tenantId, status: "ACTIVE" },
        include: {
          subscription: { include: { plan: true } },
          _count: { select: { memberships: true } },
        },
      });
      if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Company workspace not found.");
      const userLimit = tenant.subscription?.plan.userLimit ?? 1;
      if (userLimit > 0 && tenant._count.memberships >= userLimit) {
        throw new AppError(409, "PLAN_USER_LIMIT_REACHED", "The company's plan user limit has been reached.");
      }
    }

    const passwordHash = await hash(randomBytes(48).toString("base64url"), env.BCRYPT_ROUNDS);
    const user = await database.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        settings: { create: {} },
        ...(input.tenantId
          ? {
              tenantMemberships: {
                create: { tenantId: input.tenantId, role: input.tenantRole },
              },
            }
          : {}),
      },
      include: { settings: true },
    });
    const personalTenant = input.tenantId ? null : await ensurePersonalTenant(database, user);
    const assignedTenantId = input.tenantId ?? personalTenant?.id;
    const issued = await replaceAccountToken(
      database,
      user.id,
      "EMAIL_VERIFICATION",
      env.EMAIL_VERIFICATION_TTL_MINUTES,
    );
    let invitationDelivered = false;
    if (emailService) {
      try {
        await emailService.sendVerification({
          name: user.name,
          to: user.email,
          url: verificationUrl(issued.token),
        });
        invitationDelivered = true;
      } catch {
        // The account remains unverified and can use the normal resend flow.
      }
    }
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        ...(assignedTenantId ? { tenantId: assignedTenantId } : {}),
        action: "ADMIN_USER_CREATED",
        resourceType: "User",
        resourceId: user.id,
        requestId: request.id,
        metadata: {
          invitationDelivered,
          tenantRole: input.tenantRole,
          passwordResetRequired: true,
        },
      },
    });
    response.status(201).json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          verified: false,
        },
        invitationDelivered,
      },
    });
  });

  router.patch("/users/:id", async (request, response) => {
    assertMasterAdmin(request);
    const userId = idSchema.parse(request.params.id);
    const input = updateUserSchema.parse(request.body);
    if (userId === request.user!.id && (input.status === "SUSPENDED" || input.status === "DELETED")) {
      throw new AppError(
        409,
        "SELF_LOCKOUT_PREVENTED",
        "A Master Admin cannot suspend or delete the active account.",
      );
    }
    const target = await database.user.findUnique({
      where: { id: userId },
      include: { tenantMemberships: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    const now = new Date();
    await database.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.role ? { role: input.role } : {}),
          ...(input.verified !== undefined
            ? { emailVerifiedAt: input.verified ? target.emailVerifiedAt ?? now : null }
            : {}),
          ...(input.status === "DELETED" ? { deletedAt: now } : {}),
          ...(input.status === "ACTIVE" && target.deletedAt ? { deletedAt: null } : {}),
        },
      });
      if (input.tenantRole && target.tenantMemberships[0]) {
        await transaction.tenantMembership.update({
          where: { id: target.tenantMemberships[0].id },
          data: { role: input.tenantRole },
        });
      }
      if (input.status && input.status !== "ACTIVE") {
        await transaction.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          ...(target.tenantMemberships[0]
            ? { tenantId: target.tenantMemberships[0].tenantId }
            : {}),
          action: "ADMIN_USER_UPDATED",
          resourceType: "User",
          resourceId: userId,
          requestId: request.id,
          metadata: {
            status: input.status,
            role: input.role,
            tenantRole: input.tenantRole,
            verified: input.verified,
          },
        },
      });
    });
    response.json({ data: { updated: true } });
  });

  router.post("/users/:id/revoke-sessions", async (request, response) => {
    assertMasterAdmin(request);
    const userId = idSchema.parse(request.params.id);
    z.object({ confirm: z.literal(true), reason: z.string().trim().min(5).max(500) }).parse(request.body);
    const revoked = await database.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "ADMIN_SESSIONS_REVOKED",
        resourceType: "User",
        resourceId: userId,
        requestId: request.id,
        metadata: { revoked: revoked.count },
      },
    });
    response.json({ data: { revoked: revoked.count } });
  });

  router.get("/users/:id/sessions", async (request, response) => {
    assertMasterAdmin(request);
    const userId = idSchema.parse(request.params.id);
    const sessions = await database.refreshSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        tenantId: true,
        accessMode: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    response.json({
      data: {
        sessions: sessions.map(({ userAgent, ipAddress, ...session }) => ({
          ...session,
          deviceFingerprint: metadataFingerprint(userAgent),
          networkFingerprint: metadataFingerprint(ipAddress),
        })),
      },
    });
  });

  router.post("/users/:id/password-reset", async (request, response) => {
    assertMasterAdmin(request);
    const userId = idSchema.parse(request.params.id);
    const input = jobActionSchema.parse(request.body);
    const user = await database.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "The account was not found.");
    if (!user.emailVerifiedAt) {
      throw new AppError(409, "USER_NOT_VERIFIED", "Verify the account before initiating a password reset.");
    }
    const issued = await replaceAccountToken(database, user.id, "PASSWORD_RESET", env.PASSWORD_RESET_TTL_MINUTES);
    let delivered = false;
    if (emailService) {
      try {
        await emailService.sendPasswordReset({
          name: user.name,
          to: user.email,
          url: passwordResetUrl(issued.token),
        });
        delivered = true;
      } catch {
        await database.accountToken.deleteMany({ where: { id: issued.record.id } });
      }
    }
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "ADMIN_PASSWORD_RESET_INITIATED",
        resourceType: "User",
        resourceId: user.id,
        requestId: request.id,
        metadata: { delivered, reason: input.reason },
      },
    });
    response.status(202).json({ data: { delivered } });
  });

  router.get("/tenants", async (request, response) => {
    assertMasterAdmin(request);
    const query = adminListSchema.parse(request.query);
    const tenants = await database.tenant.findMany({
      ...(query.search
        ? {
            where: {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { slug: { contains: query.search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        subscription: { include: { plan: true } },
        aiBudget: true,
        companyProfile: { select: { status: true, version: true, companyName: true, updatedAt: true } },
        _count: { select: { memberships: true, dailyBriefs: true } },
      },
    });
    response.json({ data: { tenants } });
  });

  router.post("/tenants", async (request, response) => {
    assertMasterAdmin(request);
    const input = createTenantSchema.parse(request.body);
    const plan = await database.plan.findUnique({ where: { code: input.planCode } });
    if (!plan || plan.status !== "ACTIVE") {
      throw new AppError(422, "PLAN_UNAVAILABLE", "The selected plan is not available.");
    }
    if (input.planCode === "INTERNAL" && !isMasterAccount(request.user!.accountRole)) {
      throw new AppError(403, "INTERNAL_PLAN_FORBIDDEN", "Only a Master Admin can assign Internal access.");
    }
    const owner = input.ownerUserId
      ? await database.user.findFirst({ where: { id: input.ownerUserId, status: "ACTIVE" } })
      : null;
    if (input.ownerUserId && !owner) throw new AppError(404, "USER_NOT_FOUND", "Owner account not found.");
    const internal = input.planCode === "INTERNAL";
    const tenant = await database.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        ...(owner ? { owner: { connect: { id: owner.id } } } : {}),
        ...(owner
          ? { memberships: { create: { userId: owner.id, role: "TENANT_ADMIN" } } }
          : {}),
        subscription: {
          create: {
            planId: plan.id,
            status: internal ? "ACTIVE" : "TRIAL",
            ...(internal ? {} : { trialEndsAt: new Date(Date.now() + 14 * 86_400_000) }),
          },
        },
        aiBudget: {
          create: internal
            ? {
                mode: "INTERNAL_UNLIMITED",
                monthlyRequestLimit: 0,
                configuredById: request.user!.id,
                configuredAt: new Date(),
                manualOverrideReason: "Master Admin created Internal workspace.",
              }
            : plan.aiMonthlyRequestLimit > 0
              ? { mode: "LIMITED", monthlyRequestLimit: plan.aiMonthlyRequestLimit }
              : { mode: "DISABLED", monthlyRequestLimit: 0 },
        },
      },
      include: { subscription: { include: { plan: true } }, aiBudget: true },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId: tenant.id,
        action: "ADMIN_TENANT_CREATED",
        resourceType: "Tenant",
        resourceId: tenant.id,
        requestId: request.id,
        metadata: { planCode: input.planCode, ownerUserId: owner?.id },
      },
    });
    response.status(201).json({ data: { tenant } });
  });

  router.patch("/tenants/:id/status", async (request, response) => {
    assertMasterAdmin(request);
    const tenantId = idSchema.parse(request.params.id);
    const input = tenantStatusSchema.parse(request.body);
    if (tenantId === request.tenant?.id && input.status !== "ACTIVE") {
      throw new AppError(
        409,
        "SELF_LOCKOUT_PREVENTED",
        "The active Master Admin workspace cannot be suspended or archived.",
      );
    }
    const tenant = await database.tenant.update({
      where: { id: tenantId },
      data: {
        status: input.status,
        archivedAt: input.status === "ARCHIVED" ? new Date() : null,
      },
    });
    if (input.status !== "ACTIVE") {
      await database.refreshSession.updateMany({
        where: { tenantId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId,
        action: "ADMIN_TENANT_STATUS_CHANGED",
        resourceType: "Tenant",
        resourceId: tenantId,
        requestId: request.id,
        metadata: { status: input.status, reason: input.reason },
      },
    });
    response.json({ data: { tenant } });
  });

  router.put("/tenants/:id/ai-budget", async (request, response) => {
    assertMasterAdmin(request);
    const tenantId = idSchema.parse(request.params.id);
    const input = budgetSchema.parse(request.body);
    const tenant = await database.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Company workspace not found.");
    const budget = await database.aiBudget.upsert({
      where: { tenantId },
      create: {
        tenantId,
        mode: input.mode,
        monthlyRequestLimit: input.monthlyRequestLimit,
        warningThresholdPercent: input.warningThresholdPercent,
        manualOverrideReason: input.reason,
        configuredById: request.user!.id,
        configuredAt: new Date(),
      },
      update: {
        mode: input.mode,
        monthlyRequestLimit: input.monthlyRequestLimit,
        warningThresholdPercent: input.warningThresholdPercent,
        manualOverrideReason: input.reason,
        configuredById: request.user!.id,
        configuredAt: new Date(),
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId,
        action: "AI_BUDGET_CHANGED",
        resourceType: "AiBudget",
        resourceId: budget.id,
        requestId: request.id,
        metadata: {
          mode: input.mode,
          monthlyRequestLimit: input.monthlyRequestLimit,
          warningThresholdPercent: input.warningThresholdPercent,
          reason: input.reason,
        },
      },
    });
    response.json({ data: { budget } });
  });

  router.put("/tenants/:id/subscription", async (request, response) => {
    assertMasterAdmin(request);
    const tenantId = idSchema.parse(request.params.id);
    const input = subscriptionSchema.parse(request.body);
    const plan = await database.plan.findUnique({ where: { code: input.planCode } });
    if (!plan || plan.status !== "ACTIVE") {
      throw new AppError(422, "PLAN_UNAVAILABLE", "The selected plan is not available.");
    }
    const subscription = await database.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        status: input.status,
        ...(input.trialEndsAt !== undefined
          ? { trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null }
          : {}),
      },
      update: {
        planId: plan.id,
        status: input.status,
        ...(input.trialEndsAt !== undefined
          ? { trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null }
          : {}),
        ...(input.status === "CANCELLED" ? { cancelledAt: new Date() } : { cancelledAt: null }),
      },
      include: { plan: true },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId,
        action: "SUBSCRIPTION_CHANGED",
        resourceType: "Subscription",
        resourceId: subscription.id,
        requestId: request.id,
        metadata: { planCode: input.planCode, status: input.status, reason: input.reason },
      },
    });
    response.json({ data: { subscription } });
  });

  router.get("/plans", async (request, response) => {
    assertMasterAdmin(request);
    const plans = await database.plan.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    });
    response.json({ data: { plans } });
  });

  router.post("/plans", async (request, response) => {
    assertMasterAdmin(request);
    const input = planSchema.parse(request.body);
    const plan = await database.plan.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        monthlyPriceMinor: input.monthlyPriceMinor,
        currency: input.currency,
        userLimit: input.userLimit,
        leadLimit: input.leadLimit,
        campaignLimit: input.campaignLimit,
        aiMonthlyRequestLimit: input.aiMonthlyRequestLimit,
        researchMonthlyLimit: input.researchMonthlyLimit,
        storageLimitMb: input.storageLimitMb,
        features: input.features,
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "PLAN_CREATED",
        resourceType: "Plan",
        resourceId: plan.id,
        requestId: request.id,
        metadata: { code: plan.code, reason: input.reason },
      },
    });
    response.status(201).json({ data: { plan } });
  });

  router.put("/plans/:id", async (request, response) => {
    assertMasterAdmin(request);
    const id = idSchema.parse(request.params.id);
    const input = planSchema.omit({ code: true }).parse(request.body);
    const plan = await database.plan.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        monthlyPriceMinor: input.monthlyPriceMinor,
        currency: input.currency,
        userLimit: input.userLimit,
        leadLimit: input.leadLimit,
        campaignLimit: input.campaignLimit,
        aiMonthlyRequestLimit: input.aiMonthlyRequestLimit,
        researchMonthlyLimit: input.researchMonthlyLimit,
        storageLimitMb: input.storageLimitMb,
        features: input.features,
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "PLAN_UPDATED",
        resourceType: "Plan",
        resourceId: plan.id,
        requestId: request.id,
        metadata: { code: plan.code, reason: input.reason },
      },
    });
    response.json({ data: { plan } });
  });

  router.post("/plans/:id/archive", async (request, response) => {
    assertMasterAdmin(request);
    const id = idSchema.parse(request.params.id);
    const input = jobActionSchema.parse(request.body);
    const activeSubscriptions = await database.subscription.count({
      where: { planId: id, status: { in: ["TRIAL", "ACTIVE", "PAUSED"] } },
    });
    if (activeSubscriptions > 0) {
      throw new AppError(409, "PLAN_IN_USE", "Move active subscriptions before archiving this plan.");
    }
    const plan = await database.plan.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "PLAN_ARCHIVED",
        resourceType: "Plan",
        resourceId: plan.id,
        requestId: request.id,
        metadata: { reason: input.reason },
      },
    });
    response.json({ data: { plan } });
  });

  router.get("/jobs", async (request, response) => {
    assertMasterAdmin(request);
    const query = adminListSchema.extend({
      tenantId: idSchema.optional(),
      status: z.enum(["PENDING", "RUNNING", "RETRY_SCHEDULED", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"]).optional(),
    }).parse(request.query);
    const jobs = await database.automationJob.findMany({
      where: {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: {
        id: true,
        tenantId: true,
        ownerUserId: true,
        category: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        timeoutMs: true,
        scheduledAt: true,
        nextAttemptAt: true,
        startedAt: true,
        completedAt: true,
        cancelRequestedAt: true,
        errorCode: true,
        errorMessage: true,
        resultSummary: true,
        createdAt: true,
      },
    });
    response.json({ data: { jobs } });
  });

  router.post("/jobs/:id/retry", async (request, response) => {
    assertMasterAdmin(request);
    const id = idSchema.parse(request.params.id);
    const input = jobActionSchema.parse(request.body);
    const existing = await database.automationJob.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "JOB_NOT_FOUND", "The automation job was not found.");
    if (!["FAILED", "BLOCKED", "CANCELLED"].includes(existing.status)) {
      throw new AppError(409, "JOB_NOT_RETRYABLE", "Only failed, blocked, or cancelled jobs can be retried.");
    }
    const job = await database.automationJob.update({
      where: { id },
      data: {
        status: "PENDING",
        attemptCount: 0,
        scheduledAt: new Date(),
        nextAttemptAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelRequestedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId: job.tenantId,
        action: "AUTOMATION_JOB_RETRIED",
        resourceType: "AutomationJob",
        resourceId: job.id,
        requestId: request.id,
        metadata: { reason: input.reason },
      },
    });
    response.json({ data: { job } });
  });

  router.post("/jobs/:id/cancel", async (request, response) => {
    assertMasterAdmin(request);
    const id = idSchema.parse(request.params.id);
    const input = jobActionSchema.parse(request.body);
    const existing = await database.automationJob.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "JOB_NOT_FOUND", "The automation job was not found.");
    if (!["PENDING", "RETRY_SCHEDULED"].includes(existing.status)) {
      throw new AppError(409, "JOB_NOT_CANCELLABLE", "Only pending jobs can be cancelled safely.");
    }
    const now = new Date();
    const job = await database.automationJob.update({
      where: { id },
      data: { status: "CANCELLED", cancelRequestedAt: now, cancelledAt: now },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId: job.tenantId,
        action: "AUTOMATION_JOB_CANCELLED",
        resourceType: "AutomationJob",
        resourceId: job.id,
        requestId: request.id,
        metadata: { reason: input.reason },
      },
    });
    response.json({ data: { job } });
  });

  router.get("/feature-flags", async (request, response) => {
    assertMasterAdmin(request);
    const flags = await database.featureFlag.findMany({
      orderBy: [{ key: "asc" }, { scope: "asc" }],
      take: 500,
    });
    response.json({ data: { flags } });
  });

  router.put("/feature-flags", async (request, response) => {
    assertMasterAdmin(request);
    const input = featureFlagSchema.parse(request.body);
    const target = {
      key: input.key,
      scope: input.scope,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
    };
    const existing = await database.featureFlag.findFirst({ where: target });
    const flag = existing
      ? await database.featureFlag.update({
          where: { id: existing.id },
          data: { enabled: input.enabled, rolloutPercent: input.rolloutPercent, reason: input.reason },
        })
      : await database.featureFlag.create({
          data: {
            ...target,
            enabled: input.enabled,
            rolloutPercent: input.rolloutPercent,
            reason: input.reason,
            createdById: request.user!.id,
          },
        });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        action: "FEATURE_FLAG_CHANGED",
        resourceType: "FeatureFlag",
        resourceId: flag.id,
        requestId: request.id,
        metadata: {
          key: flag.key,
          scope: flag.scope,
          enabled: flag.enabled,
          rolloutPercent: flag.rolloutPercent,
          reason: input.reason,
        },
      },
    });
    response.json({ data: { flag } });
  });

  router.get("/support-sessions", async (request, response) => {
    assertMasterAdmin(request);
    const sessions = await database.supportSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
      include: {
        targetUser: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true, kind: true } },
      },
    });
    response.json({ data: { sessions } });
  });

  router.post("/support-sessions", async (request, response) => {
    assertMasterAdmin(request);
    const input = supportSessionSchema.parse(request.body);
    const membership = await database.tenantMembership.findFirst({
      where: { tenantId: input.tenantId, userId: input.targetUserId, tenant: { status: "ACTIVE" } },
    });
    if (!membership) throw new AppError(404, "SUPPORT_TARGET_NOT_FOUND", "The user is not assigned to the requested workspace.");
    const session = await database.supportSession.create({
      data: {
        actorUserId: request.user!.id,
        targetUserId: input.targetUserId,
        tenantId: input.tenantId,
        accessLevel: input.accessLevel,
        reason: input.reason,
        expiresAt: new Date(Date.now() + input.durationMinutes * 60_000),
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId: input.tenantId,
        action: "SUPPORT_SESSION_STARTED",
        resourceType: "SupportSession",
        resourceId: session.id,
        requestId: request.id,
        metadata: { targetUserId: input.targetUserId, accessLevel: input.accessLevel, reason: input.reason, expiresAt: session.expiresAt.toISOString() },
      },
    });
    response.status(201).json({ data: { session } });
  });

  router.post("/support-sessions/:id/end", async (request, response) => {
    assertMasterAdmin(request);
    const id = idSchema.parse(request.params.id);
    const input = jobActionSchema.parse(request.body);
    const session = await database.supportSession.update({
      where: { id },
      data: { endedAt: new Date() },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId: session.tenantId,
        action: "SUPPORT_SESSION_ENDED",
        resourceType: "SupportSession",
        resourceId: session.id,
        requestId: request.id,
        metadata: { reason: input.reason },
      },
    });
    response.json({ data: { session } });
  });

  router.get("/system", systemStatusRateLimiter, async (request, response) => {
    assertMasterAdmin(request);
    let databaseStatus: "UP" | "DOWN" = "UP";
    let redisStatus: "UP" | "DOWN" | "NOT_CONFIGURED" = redis ? "UP" : "NOT_CONFIGURED";
    try {
      await database.$queryRaw`SELECT 1`;
    } catch {
      databaseStatus = "DOWN";
    }
    if (redis) {
      try {
        const pong = await redis.sendCommand(["PING"]);
        if (pong !== "PONG") redisStatus = "DOWN";
      } catch {
        redisStatus = "DOWN";
      }
    }
    const [jobs, departments] = await Promise.all([
      database.automationJob.groupBy({ by: ["status"], _count: { _all: true } }),
      database.salesDepartmentConfig.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    response.json({
      data: {
        database: databaseStatus,
        redis: redisStatus,
        webService: "UP",
        worker: "IN_PROCESS_BOUNDED",
        deploymentVersion: process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? "unknown",
        providers: {
          ai: { configured: Boolean(env.GROQ_API_KEY), model: env.GROQ_MODEL },
          search: searchProviderConfiguration(),
          email: { enabled: env.OUTBOUND_EMAIL_ENABLED, mode: env.OUTBOUND_DELIVERY_MODE, provider: env.EMAIL_DELIVERY_MODE },
        },
        jobs: Object.fromEntries(jobs.map((item) => [item.status, item._count._all])),
        salesDepartments: Object.fromEntries(departments.map((item) => [item.status, item._count._all])),
      },
    });
  });

  router.get("/audit-logs", async (request, response) => {
    assertMasterAdmin(request);
    const query = adminListSchema.extend({
      action: z.string().trim().max(100).optional(),
      tenantId: idSchema.optional(),
    }).parse(request.query);
    const auditLogs = await database.auditLog.findMany({
      where: {
        ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: {
        id: true,
        actorUserId: true,
        tenantId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        requestId: true,
        metadata: true,
        createdAt: true,
      },
    });
    response.json({ data: { auditLogs } });
  });

  router.get("/overview", async (request, response) => {
    assertMasterAdmin(request);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [users, activeSessionCount, aiRequests, searchUsage, sentMessages, failedJobs, complaints, campaigns] =
      await Promise.all([
        database.user.count(),
        database.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(DISTINCT "userId")::int AS count
          FROM "RefreshSession"
          WHERE "revokedAt" IS NULL AND "expiresAt" > NOW()
        `,
        database.aiRequest.count({ where: { createdAt: { gte: monthStart } } }),
        database.searchUsage.aggregate({ where: { updatedAt: { gte: monthStart } }, _sum: { count: true } }),
        database.campaignMessage.count({ where: { sentAt: { gte: monthStart } } }),
        database.researchJob.count({ where: { status: "FAILED", createdAt: { gte: monthStart } } }),
        database.optOut.count({ where: { source: "COMPLAINT", createdAt: { gte: monthStart } } }),
        database.campaign.groupBy({ by: ["status"], _count: { _all: true } }),
      ]);
    const auditLogs = await database.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        requestId: true,
        createdAt: true,
      },
    });
    const tenancyAvailable = typeof (database as unknown as {
      tenant?: { count?: unknown };
    }).tenant?.count === "function";
    const [tenants, subscriptions, aiBudgets] = tenancyAvailable
      ? await Promise.all([
          database.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
          database.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
          database.aiBudget.groupBy({ by: ["mode"], _count: { _all: true } }),
        ])
      : [[], [], []];
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "ADMIN_OVERVIEW_VIEWED",
        resourceType: "AdminDashboard",
        requestId: request.id,
      },
    });
    response.json({
      data: {
        users,
        activeUsers: activeSessionCount[0]?.count ?? 0,
        tenants: Object.fromEntries(tenants.map((item) => [item.status, item._count._all])),
        subscriptions: Object.fromEntries(
          subscriptions.map((item) => [item.status, item._count._all]),
        ),
        aiBudgetPolicies: Object.fromEntries(
          aiBudgets.map((item) => [item.mode, item._count._all]),
        ),
        aiRequests,
        searchRequests: searchUsage._sum.count ?? 0,
        emailSends: sentMessages,
        failedJobs,
        providerHealth: {
          search: searchProviderConfiguration(),
          ai: {
            provider: "GROQ",
            configured: Boolean(env.GROQ_API_KEY),
            model: env.GROQ_MODEL,
          },
          email: { provider: env.EMAIL_DELIVERY_MODE, outboundEnabled: env.OUTBOUND_EMAIL_ENABLED },
        },
        monthlyBudget: {
          aiRequests: env.AI_MONTHLY_REQUEST_LIMIT,
          searchRequests: env.SEARCH_MONTHLY_REQUEST_LIMIT,
          outboundDailyLimit: env.OUTBOUND_DAILY_LIMIT,
        },
        abuseFlags: complaints,
        campaignActivity: Object.fromEntries(campaigns.map((item) => [item.status, item._count._all])),
        auditLogs,
      },
    });
  });

  return router;
}
