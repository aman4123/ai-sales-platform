import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";

export type WorkspaceKind = "CUSTOMER" | "INTERNAL" | "TEST";

export interface TenantContext {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  kind: WorkspaceKind;
  role:
    | "TENANT_ADMIN"
    | "SALES_MANAGER"
    | "SALES_USER"
    | "REVIEWER"
    | "BILLING_ADMIN"
    | "VIEWER";
}

interface TenantUser {
  id: string;
  name: string;
  role: string;
}

function isMasterRole(role: string) {
  return role === "MASTER_ADMIN" || role === "SUPER_ADMIN";
}

function tenantSlug(user: TenantUser, kind: WorkspaceKind) {
  if (kind === "INTERNAL") return "internal-company-workspace";
  if (kind === "TEST") return "internal-tester-workspace";
  const base = user.name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40) || "workspace";
  const fingerprint = createHash("sha256").update(user.id).digest("hex").slice(0, 12);
  return `${base}-${fingerprint}`;
}

function tenantName(user: TenantUser, kind: WorkspaceKind) {
  if (kind === "INTERNAL") return "Internal Company Workspace";
  if (kind === "TEST") return "Internal Tester Workspace";
  return `${user.name.trim() || "Personal"} workspace`;
}

function tenantClientAvailable(database: DatabaseClient) {
  const candidate = database as unknown as {
    tenantMembership?: { findFirst?: unknown };
    tenant?: { create?: unknown };
  };
  return typeof candidate.tenantMembership?.findFirst === "function"
    && typeof candidate.tenant?.create === "function";
}

function contextFromMembership(membership: {
  role: TenantContext["role"];
  tenant: {
    id: string;
    name: string;
    status: TenantContext["status"];
    kind: WorkspaceKind;
  };
}): TenantContext {
  return {
    id: membership.tenant.id,
    name: membership.tenant.name,
    status: membership.tenant.status,
    kind: membership.tenant.kind,
    role: membership.role,
  };
}

export async function ensureWorkspaceTenant(
  database: DatabaseClient,
  user: TenantUser,
  requestedKind: WorkspaceKind,
): Promise<TenantContext | null> {
  // Lightweight route unit tests use intentionally narrow database doubles. Real
  // Prisma clients always expose these delegates after the tenant migration.
  if (!tenantClientAvailable(database)) return null;

  const kind = isMasterRole(user.role) ? requestedKind : "CUSTOMER";
  const existing = await database.tenantMembership.findFirst({
    where: {
      userId: user.id,
      tenant: { kind, status: { not: "ARCHIVED" } },
    },
    orderBy: { createdAt: "asc" },
    include: { tenant: true },
  });
  if (existing) return contextFromMembership(existing);

  const internal = kind === "INTERNAL" || kind === "TEST";
  const planCode = internal ? "INTERNAL" : "FREE_TRIAL";
  const plan = await database.plan.findUnique({ where: { code: planCode } });
  const customerAiLimit = Math.max(0, plan?.aiMonthlyRequestLimit ?? env.AI_MONTHLY_REQUEST_LIMIT);
  const customerAiEnabled = customerAiLimit > 0;

  try {
    const tenant = await database.tenant.create({
      data: {
        name: tenantName(user, kind),
        slug: tenantSlug(user, kind),
        kind,
        ownerUserId: user.id,
        memberships: {
          create: { userId: user.id, role: "TENANT_ADMIN" },
        },
        aiBudget: {
          create: internal
            ? {
                mode: "INTERNAL_UNLIMITED",
                monthlyRequestLimit: 0,
                manualOverrideReason: "Secure platform-owner internal access.",
                configuredById: user.id,
                configuredAt: new Date(),
              }
            : {
                mode: customerAiEnabled ? "LIMITED" : "DISABLED",
                monthlyRequestLimit: customerAiLimit,
              },
        },
        salesDepartment: { create: {} },
        ...(plan
          ? {
              subscription: {
                create: {
                  planId: plan.id,
                  status: internal ? "ACTIVE" : "TRIAL",
                  ...(internal
                    ? {}
                    : { trialEndsAt: new Date(Date.now() + 14 * 86_400_000) }),
                },
              },
            }
          : {}),
      },
      include: {
        memberships: { where: { userId: user.id }, take: 1 },
      },
    });
    const membership = tenant.memberships[0]!;
    await database.auditLog.create({
      data: {
        actorUserId: user.id,
        tenantId: tenant.id,
        action: "TENANT_BOOTSTRAPPED",
        resourceType: "Tenant",
        resourceId: tenant.id,
        metadata: {
          kind,
          planCode,
          aiBudgetMode: internal ? "INTERNAL_UNLIMITED" : customerAiEnabled ? "LIMITED" : "DISABLED",
          aiMonthlyRequestLimit: internal ? null : customerAiLimit,
        },
      },
    });
    return {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      kind: tenant.kind,
      role: membership.role,
    };
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const raced = await database.tenantMembership.findFirst({
      where: { userId: user.id, tenant: { kind, status: { not: "ARCHIVED" } } },
      orderBy: { createdAt: "asc" },
      include: { tenant: true },
    });
    if (!raced) throw error;
    return contextFromMembership(raced);
  }
}

export async function ensureTenantForAccessMode(
  database: DatabaseClient,
  user: TenantUser,
  accessMode: "USER" | "TESTER" | "MASTER_ADMIN",
) {
  const kind: WorkspaceKind = isMasterRole(user.role)
    ? accessMode === "TESTER" ? "TEST" : "INTERNAL"
    : "CUSTOMER";
  return ensureWorkspaceTenant(database, user, kind);
}

export async function tenantContextById(
  database: DatabaseClient,
  userId: string,
  tenantId: string,
): Promise<TenantContext | null> {
  if (!tenantClientAvailable(database)) return null;
  const membership = await database.tenantMembership.findFirst({
    where: { userId, tenantId },
    include: { tenant: true },
  });
  return membership ? contextFromMembership(membership) : null;
}

export async function ensurePersonalTenant(
  database: DatabaseClient,
  user: TenantUser,
): Promise<TenantContext | null> {
  return ensureTenantForAccessMode(database, user, isMasterRole(user.role) ? "MASTER_ADMIN" : "USER");
}

export async function tenantUserIds(
  database: DatabaseClient,
  tenantId: string,
  fallbackUserId: string,
) {
  const memberships = await database.tenantMembership.findMany({
    where: { tenantId },
    select: { userId: true },
  });
  return memberships.length > 0
    ? memberships.map((membership) => membership.userId)
    : [fallbackUserId];
}

export function tenantScope(
  tenant: { id: string } | undefined,
  fallbackUserId: string,
) {
  return tenant ? { tenantId: tenant.id } : { userId: fallbackUserId };
}

export function tenantWrite(tenant: { id: string } | undefined) {
  return tenant ? { tenantId: tenant.id } : {};
}
