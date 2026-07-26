import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../lib/errors.js";

export type UserRole = "ADMIN" | "MEMBER" | "USER" | "SUPER_ADMIN";
export type AccessMode = "USER" | "TESTER" | "MASTER_ADMIN";

export interface AccountUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedUser extends AccountUser {
  accountRole: UserRole;
  accessMode: AccessMode;
  sessionId?: string;
}

const accessPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER", "USER", "SUPER_ADMIN"]),
  accountRole: z.enum(["ADMIN", "MEMBER", "USER", "SUPER_ADMIN"]).optional(),
  accessMode: z.enum(["USER", "TESTER", "MASTER_ADMIN"]).optional(),
  sid: z.string().min(1).optional(),
  type: z.literal("access"),
});

const refreshPayloadSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  type: z.literal("refresh"),
});

export function testerModesEnabled() {
  return env.NODE_ENV !== "production" || env.TESTER_MODE_ENABLED;
}

export function defaultAccessMode(role: UserRole): AccessMode {
  return role === "SUPER_ADMIN" ? "MASTER_ADMIN" : "USER";
}

export function availableAccessModes(role: UserRole): AccessMode[] {
  if (role !== "SUPER_ADMIN") return [];
  return testerModesEnabled()
    ? ["USER", "TESTER", "MASTER_ADMIN"]
    : ["MASTER_ADMIN"];
}

export function effectiveRole(role: UserRole, accessMode: AccessMode): UserRole {
  if (role !== "SUPER_ADMIN") return role;
  if (accessMode === "USER") return "USER";
  if (accessMode === "TESTER") return "ADMIN";
  return "SUPER_ADMIN";
}

export function signAccessToken(
  user: AccountUser,
  sessionId?: string,
  requestedMode: AccessMode = defaultAccessMode(user.role),
): string {
  const accessMode = availableAccessModes(user.role).includes(requestedMode)
    ? requestedMode
    : defaultAccessMode(user.role);
  return jwt.sign(
    {
      email: user.email,
      role: effectiveRole(user.role, accessMode),
      accountRole: user.role,
      accessMode,
      ...(sessionId ? { sid: sessionId } : {}),
      type: "access",
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: user.id,
      jwtid: randomUUID(),
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      algorithm: "HS256",
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
  );
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ sid: sessionId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
    algorithm: "HS256",
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  try {
    const payload = accessPayloadSchema.parse(
      jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ["HS256"],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      }),
    );

    const accountRole = payload.accountRole ?? payload.role;
    const requestedMode = payload.accessMode ?? defaultAccessMode(accountRole);
    const accessMode = availableAccessModes(accountRole).includes(requestedMode)
      ? requestedMode
      : defaultAccessMode(accountRole);
    return {
      id: payload.sub,
      email: payload.email,
      role: effectiveRole(accountRole, accessMode),
      accountRole,
      accessMode,
      ...(payload.sid ? { sessionId: payload.sid } : {}),
    };
  } catch {
    throw new UnauthorizedError("The access token is invalid or expired.");
  }
}

export function verifyRefreshToken(token: string): { userId: string; sessionId: string } {
  try {
    const payload = refreshPayloadSchema.parse(
      jwt.verify(token, env.JWT_REFRESH_SECRET, {
        algorithms: ["HS256"],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      }),
    );

    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    throw new UnauthorizedError("The refresh session is invalid or expired.");
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenHashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
