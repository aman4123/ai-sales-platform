import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { CookieOptions, Request } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  type AuthenticatedUser,
} from "./auth.tokens.js";

export const REFRESH_COOKIE = "refresh_token";
export const DUMMY_PASSWORD_HASH = "$2b$12$O5II/e8N4LcE1ViEFk8H7OBtPzFZ7hKjfa32SD1HBXlwNtIf8iS6u";

const commonPasswords = new Set([
  "123456789012",
  "password1234", // gitleaks:allow -- intentional breached-password deny-list entry
  "qwerty123456",
  "letmein123456",
  "admin12345678",
]);

export const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 UTF-8 bytes.",
  })
  .refine((password) => !commonPasswords.has(password.toLowerCase()), {
    message: "Choose a less common password.",
  });

export const clearCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",
};

export const cookieOptions: CookieOptions = {
  ...clearCookieOptions,
  maxAge: env.JWT_REFRESH_TTL_SECONDS * 1_000,
};

export interface UserWithSettings {
  id: string;
  email: string;
  emailVerifiedAt?: Date | null;
  passwordHash: string;
  name: string;
  role: AuthenticatedUser["role"];
  settings: {
    company: string;
    signature: string;
    aiProvider: "MOCK" | "DEEPSEEK";
    theme: "DARK" | "LIGHT" | "SYSTEM";
    notifications: boolean;
  } | null;
}

export function serializeUser(user: UserWithSettings) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    name: user.name,
    role: user.role,
    settings: user.settings ?? {
      company: "",
      signature: "",
      aiProvider: "MOCK" as const,
      theme: "DARK" as const,
      notifications: true,
    },
  };
}

export function sessionMetadata(request: Request) {
  const userAgent = request.get("user-agent");
  return {
    ...(userAgent ? { userAgent } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
}

export function authUser(user: UserWithSettings): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role };
}

export async function createSession(
  database: DatabaseClient,
  user: AuthenticatedUser,
  metadata: ReturnType<typeof sessionMetadata>,
) {
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken(user.id, sessionId);

  await database.refreshSession.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });
  await database.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1_000),
      ...metadata,
    },
  });

  return { accessToken: signAccessToken(user), refreshToken };
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export async function replaceAccountToken(
  database: DatabaseClient,
  userId: string,
  type: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  ttlMinutes: number,
) {
  const token = createOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  const record = await database.$transaction(async (transaction) => {
    await transaction.accountToken.deleteMany({
      where: { userId, type, usedAt: null },
    });
    await transaction.accountToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
    return transaction.accountToken.create({
      data: { userId, type, tokenHash, expiresAt },
    });
  });

  return { token, record };
}

export function generateRecoveryCodes() {
  return Array.from({ length: env.RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(10).toString("hex").toUpperCase();
    return value.match(/.{1,5}/g)!.join("-");
  });
}

export function recoveryCodeHash(code: string) {
  return hashToken(code.replace(/[^a-fA-F0-9]/g, "").toUpperCase());
}

export function recoveryCodeRows(userId: string, codes: string[]) {
  return codes.map((code) => ({ userId, codeHash: recoveryCodeHash(code) }));
}

export async function hashPassword(password: string) {
  return hash(password, env.BCRYPT_ROUNDS);
}
