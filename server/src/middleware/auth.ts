import type { RequestHandler } from "express";
import { AppError, UnauthorizedError } from "../lib/errors.js";
import type { DatabaseClient } from "../lib/prisma.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { isMasterAccount } from "../modules/auth/auth.tokens.js";

export const requireAuth: RequestHandler = (request, _response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new UnauthorizedError());
    return;
  }

  request.user = verifyAccessToken(authorization.slice("Bearer ".length));
  next();
};

export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (!request.user || !["ADMIN", "SUPER_ADMIN", "MASTER_ADMIN"].includes(request.user.role)) {
    next(new AppError(403, "ADMIN_REQUIRED", "Administrator access is required."));
    return;
  }
  next();
};

export const requireSuperAdmin: RequestHandler = (request, _response, next) => {
  if (!request.user || !isMasterAccount(request.user.accountRole)) {
    next(new AppError(403, "SUPER_ADMIN_REQUIRED", "Super administrator access is required."));
    return;
  }
  next();
};

export function requireActiveSession(database: DatabaseClient): RequestHandler {
  return async (request, _response, next) => {
    if (!request.user?.sessionId) {
      next();
      return;
    }

    const session = await database.refreshSession.findFirst({
      where: {
        id: request.user.sessionId,
        userId: request.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    });
    if (!session) {
      next(new UnauthorizedError("The access session is no longer active."));
      return;
    }
    next();
  };
}

export function resolveSupportContext(database: DatabaseClient): RequestHandler {
  return async (request, response, next) => {
    const supportSessionId = request.header("x-support-session-id");
    if (!supportSessionId) {
      next();
      return;
    }
    if (
      !request.user
      || !isMasterAccount(request.user.accountRole)
      || request.user.accessMode !== "MASTER_ADMIN"
    ) {
      next(new AppError(403, "SUPPORT_MODE_FORBIDDEN", "Master Admin mode is required for support access."));
      return;
    }
    const actorUserId = request.user.id;
    const support = await database.supportSession.findFirst({
      where: {
        id: supportSessionId,
        actorUserId,
        endedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        targetUser: true,
        tenant: true,
      },
    });
    if (!support || support.tenant.status !== "ACTIVE" || support.targetUser.status !== "ACTIVE") {
      next(new AppError(403, "SUPPORT_SESSION_INVALID", "The support session is unavailable or expired."));
      return;
    }
    if (
      support.accessLevel === "READ_ONLY"
      && !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      next(new AppError(403, "SUPPORT_READ_ONLY", "This support session is read-only."));
      return;
    }
    const membership = await database.tenantMembership.findFirst({
      where: { tenantId: support.tenantId, userId: support.targetUserId },
    });
    if (!membership) {
      next(new AppError(403, "SUPPORT_TARGET_UNAVAILABLE", "The support target is no longer assigned to this workspace."));
      return;
    }
    request.support = {
      sessionId: support.id,
      actorUserId,
      targetUserId: support.targetUserId,
      tenantId: support.tenantId,
      accessLevel: support.accessLevel,
      expiresAt: support.expiresAt,
    };
    request.user = {
      ...request.user,
      id: support.targetUser.id,
      email: support.targetUser.email,
      role: support.targetUser.role,
      accountRole: support.targetUser.role,
      accessMode: "USER",
      tenantId: support.tenantId,
    };
    response.setHeader("x-support-mode", support.accessLevel.toLowerCase());
    response.on("finish", () => {
      void database.auditLog.create({
        data: {
          actorUserId,
          tenantId: support.tenantId,
          action: "SUPPORT_REQUEST",
          resourceType: "SupportSession",
          resourceId: support.id,
          requestId: request.id,
          metadata: {
            targetUserId: support.targetUserId,
            accessLevel: support.accessLevel,
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
          },
        },
      }).catch(() => undefined);
    });
    next();
  };
}

export function resolveTenantContext(database: DatabaseClient): RequestHandler {
  return async (request, _response, next) => {
    if (!request.user) {
      next(new UnauthorizedError());
      return;
    }

    const candidate = database as unknown as {
      tenantMembership?: { findFirst?: unknown };
    };
    if (typeof candidate.tenantMembership?.findFirst !== "function") {
      next();
      return;
    }

    const membership = await database.tenantMembership.findFirst({
      where: {
        userId: request.user.id,
        ...(request.user.tenantId ? { tenantId: request.user.tenantId } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: { tenant: true },
    });
    if (!membership) {
      next(new AppError(403, "TENANT_ACCESS_DENIED", "No active company workspace is assigned."));
      return;
    }
    if (membership.tenant.status !== "ACTIVE") {
      next(new AppError(423, "TENANT_UNAVAILABLE", "This company workspace is not active."));
      return;
    }

    request.tenant = {
      id: membership.tenant.id,
      name: membership.tenant.name,
      status: membership.tenant.status,
      kind: membership.tenant.kind,
      role: membership.role,
    };
    next();
  };
}
