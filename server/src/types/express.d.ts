import type { AuthenticatedUser } from "../modules/auth/auth.tokens.js";
import type { TenantContext } from "../modules/tenancy/tenant.service.js";

declare module "express-serve-static-core" {
  interface Request {
    id: string;
    rawBody?: Buffer;
    user?: AuthenticatedUser;
    tenant?: TenantContext;
    support?: {
      sessionId: string;
      actorUserId: string;
      targetUserId: string;
      tenantId: string;
      accessLevel: "READ_ONLY" | "WRITE";
      expiresAt: Date;
    };
  }
}
