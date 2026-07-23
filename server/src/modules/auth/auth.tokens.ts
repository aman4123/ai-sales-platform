import { createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../lib/errors.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "ADMIN" | "MEMBER";
}

const accessPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]),
  type: z.literal("access"),
});

const refreshPayloadSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  type: z.literal("refresh"),
});

export function signAccessToken(user: AuthenticatedUser): string {
  return jwt.sign(
    { email: user.email, role: user.role, type: "access" },
    env.JWT_ACCESS_SECRET,
    { subject: user.id, expiresIn: env.JWT_ACCESS_TTL_SECONDS, algorithm: "HS256" },
  );
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ sid: sessionId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  try {
    const payload = accessPayloadSchema.parse(
      jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }),
    );

    return { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    throw new UnauthorizedError("The access token is invalid or expired.");
  }
}

export function verifyRefreshToken(token: string): { userId: string; sessionId: string } {
  try {
    const payload = refreshPayloadSchema.parse(
      jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] }),
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
