import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { Router, type CookieOptions, type Request } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  tokenHashesMatch,
  verifyRefreshToken,
  type AuthenticatedUser,
} from "./auth.tokens.js";

const REFRESH_COOKIE = "refresh_token";
const DUMMY_PASSWORD_HASH = "$2b$12$O5II/e8N4LcE1ViEFk8H7OBtPzFZ7hKjfa32SD1HBXlwNtIf8iS6u";

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters.")
  .max(128)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 UTF-8 bytes.",
  });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",
  maxAge: env.JWT_REFRESH_TTL_SECONDS * 1_000,
};

interface UserWithSettings {
  id: string;
  email: string;
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

function serializeUser(user: UserWithSettings) {
  return {
    id: user.id,
    email: user.email,
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

function sessionMetadata(request: Request) {
  const userAgent = request.get("user-agent");
  return {
    ...(userAgent ? { userAgent } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
}

async function createSession(
  database: DatabaseClient,
  user: AuthenticatedUser,
  metadata: ReturnType<typeof sessionMetadata>,
) {
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken(user.id, sessionId);

  await database.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1_000),
      ...metadata,
    },
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken,
  };
}

function authUser(user: UserWithSettings): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role };
}

export function createAuthRouter(database: DatabaseClient) {
  const router = Router();

  router.post("/register", async (request, response) => {
    const input = registerSchema.parse(request.body);
    const existing = await database.user.findUnique({ where: { email: input.email } });

    if (existing) {
      throw new AppError(409, "EMAIL_IN_USE", "An account already exists for this email address.");
    }

    const passwordHash = await hash(input.password, env.BCRYPT_ROUNDS);

    let user: UserWithSettings;
    try {
      user = await database.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          settings: { create: {} },
        },
        include: { settings: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new AppError(
          409,
          "EMAIL_IN_USE",
          "An account already exists for this email address.",
        );
      }
      throw error;
    }

    const tokens = await createSession(database, authUser(user), sessionMetadata(request));
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions);
    response.status(201).json({
      data: { user: serializeUser(user), accessToken: tokens.accessToken },
    });
  });

  router.post("/login", async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { email: input.email },
      include: { settings: true },
    });

    const passwordMatches = await compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches) {
      throw new UnauthorizedError("The email address or password is incorrect.");
    }

    const tokens = await createSession(database, authUser(user), sessionMetadata(request));
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions);
    response.json({ data: { user: serializeUser(user), accessToken: tokens.accessToken } });
  });

  router.post("/refresh", async (request, response) => {
    const currentToken = request.cookies[REFRESH_COOKIE] as string | undefined;
    if (!currentToken) {
      throw new UnauthorizedError("No refresh session was provided.");
    }

    const payload = verifyRefreshToken(currentToken);
    const session = await database.refreshSession.findUnique({
      where: { id: payload.sessionId },
      include: { user: { include: { settings: true } } },
    });
    const currentHash = hashToken(currentToken);

    if (
      !session ||
      session.userId !== payload.userId ||
      !tokenHashesMatch(session.tokenHash, currentHash) ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedError("The refresh session is invalid or expired.");
    }

    if (session.revokedAt) {
      await database.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError("Refresh token reuse was detected. Please sign in again.");
    }

    const nextSessionId = randomUUID();
    const nextRefreshToken = signRefreshToken(session.userId, nextSessionId);
    const now = new Date();

    await database.$transaction(async (transaction) => {
      const revoked = await transaction.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedError("The refresh session has already been used.");
      }

      await transaction.refreshSession.create({
        data: {
          id: nextSessionId,
          userId: session.userId,
          tokenHash: hashToken(nextRefreshToken),
          expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1_000),
          ...sessionMetadata(request),
        },
      });
    });

    const user = session.user as UserWithSettings;
    response.cookie(REFRESH_COOKIE, nextRefreshToken, cookieOptions);
    response.json({
      data: {
        user: serializeUser(user),
        accessToken: signAccessToken(authUser(user)),
      },
    });
  });

  router.post("/logout", async (request, response) => {
    const currentToken = request.cookies[REFRESH_COOKIE] as string | undefined;

    if (currentToken) {
      try {
        const payload = verifyRefreshToken(currentToken);
        await database.refreshSession.updateMany({
          where: {
            id: payload.sessionId,
            userId: payload.userId,
            tokenHash: hashToken(currentToken),
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      } catch {
        // Logout remains idempotent when a cookie is expired or malformed.
      }
    }

    response.clearCookie(REFRESH_COOKIE, cookieOptions);
    response.status(204).send();
  });

  router.get("/me", requireAuth, async (request, response) => {
    const user = await database.user.findUnique({
      where: { id: request.user!.id },
      include: { settings: true },
    });

    if (!user) {
      throw new UnauthorizedError("The authenticated account no longer exists.");
    }

    response.json({ data: { user: serializeUser(user) } });
  });

  return router;
}
