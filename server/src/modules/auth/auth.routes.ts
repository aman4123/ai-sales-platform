import { randomUUID } from "node:crypto";
import { compare } from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { EmailService } from "../../lib/email.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import type { RequestRateLimiters } from "../../middleware/request-security.js";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  tokenHashesMatch,
  verifyRefreshToken,
} from "./auth.tokens.js";
import {
  DUMMY_PASSWORD_HASH,
  REFRESH_COOKIE,
  authUser,
  clearCookieOptions,
  cookieOptions,
  createSession,
  generateRecoveryCodes,
  hashPassword,
  passwordSchema,
  recoveryCodeHash,
  recoveryCodeRows,
  refreshTokenFromRequest,
  replaceAccountToken,
  serializeUser,
  sessionMetadata,
  type UserWithSettings,
} from "./auth.security.js";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
const emailRequestSchema = z.object({ email: emailSchema });
const tokenSchema = z.object({ token: z.string().min(32).max(256) });
const resetPasswordSchema = tokenSchema.extend({ password: passwordSchema });
const recoverSchema = z.object({
  email: emailSchema,
  recoveryCode: z.string().trim().min(20).max(32),
  password: passwordSchema,
});
const regenerateCodesSchema = z.object({ password: z.string().min(1).max(128) });

const genericEmailResponse = {
  message: "If an eligible account exists, an email will arrive shortly.",
};

function accountUrl(pathname: string, token: string) {
  const url = new URL(pathname, env.APP_BASE_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

function developmentToken(token: string, name: string) {
  return env.NODE_ENV === "production" ? {} : { [name]: token };
}

async function revokeAllSessions(database: DatabaseClient, userId: string) {
  await database.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function createAuthRouter(
  database: DatabaseClient,
  emailService: EmailService,
  rateLimiters: Pick<RequestRateLimiters, "auth">,
) {
  const router = Router();

  router.post("/register", rateLimiters.auth, async (request, response) => {
    const input = registerSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const existing = await database.user.findUnique({ where: { email: input.email } });

    if (existing) {
      let issuedToken: string | undefined;
      if (existing.emailVerifiedAt === null) {
        const issued = await replaceAccountToken(
          database,
          existing.id,
          "EMAIL_VERIFICATION",
          env.EMAIL_VERIFICATION_TTL_MINUTES,
        );
        issuedToken = issued.token;
        try {
          await emailService.sendVerification({
            name: existing.name,
            to: existing.email,
            url: accountUrl("/verify-email", issued.token),
          });
        } catch (error) {
          await database.accountToken.deleteMany({ where: { id: issued.record.id } });
          logger.error(
            { err: error, userId: existing.id, requestId: request.id },
            "Existing-account verification email failed",
          );
        }
      }
      response.status(201).json({
        data: {
          email: input.email,
          verificationRequired: true,
          ...(issuedToken ? developmentToken(issuedToken, "developmentVerificationToken") : {}),
        },
      });
      return;
    }

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
        response.status(201).json({
          data: { email: input.email, verificationRequired: true },
        });
        return;
      }
      throw error;
    }

    const issued = await replaceAccountToken(
      database,
      user.id,
      "EMAIL_VERIFICATION",
      env.EMAIL_VERIFICATION_TTL_MINUTES,
    );

    try {
      await emailService.sendVerification({
        name: user.name,
        to: user.email,
        url: accountUrl("/verify-email", issued.token),
      });
    } catch (error) {
      await database.accountToken.deleteMany({ where: { id: issued.record.id } });
      logger.error({ err: error, userId: user.id, requestId: request.id }, "Verification email failed");
      throw new AppError(
        503,
        "EMAIL_DELIVERY_FAILED",
        "The account was created, but the verification email could not be sent. Request a new verification email shortly.",
      );
    }

    response.status(201).json({
      data: {
        email: user.email,
        verificationRequired: true,
        ...developmentToken(issued.token, "developmentVerificationToken"),
      },
    });
  });

  router.post("/verification/request", rateLimiters.auth, async (request, response) => {
    const input = emailRequestSchema.parse(request.body);
    const user = await database.user.findUnique({ where: { email: input.email } });
    let issuedToken: string | undefined;

    if (user?.emailVerifiedAt === null) {
      const issued = await replaceAccountToken(
        database,
        user.id,
        "EMAIL_VERIFICATION",
        env.EMAIL_VERIFICATION_TTL_MINUTES,
      );
      issuedToken = issued.token;
      try {
        await emailService.sendVerification({
          name: user.name,
          to: user.email,
          url: accountUrl("/verify-email", issued.token),
        });
      } catch (error) {
        await database.accountToken.deleteMany({ where: { id: issued.record.id } });
        logger.error({ err: error, userId: user.id, requestId: request.id }, "Verification resend failed");
      }
    }

    response.status(202).json({
      data: {
        ...genericEmailResponse,
        ...(issuedToken ? developmentToken(issuedToken, "developmentVerificationToken") : {}),
      },
    });
  });

  router.post("/verify-email", rateLimiters.auth, async (request, response) => {
    const input = tokenSchema.parse(request.body);
    const now = new Date();
    const record = await database.accountToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      include: { user: { include: { settings: true } } },
    });

    if (
      !record ||
      record.type !== "EMAIL_VERIFICATION" ||
      record.usedAt ||
      record.expiresAt <= now
    ) {
      throw new AppError(400, "VERIFICATION_TOKEN_INVALID", "The verification link is invalid or expired.");
    }

    const recoveryCodes = generateRecoveryCodes();
    const user = await database.$transaction(async (transaction) => {
      const consumed = await transaction.accountToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return null;

      const verified = await transaction.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now },
        include: { settings: true },
      });
      await transaction.accountToken.deleteMany({
        where: { userId: record.userId, type: "EMAIL_VERIFICATION", id: { not: record.id } },
      });
      await transaction.recoveryCode.deleteMany({ where: { userId: record.userId } });
      await transaction.recoveryCode.createMany({ data: recoveryCodeRows(record.userId, recoveryCodes) });
      return verified;
    });

    if (!user) {
      throw new AppError(400, "VERIFICATION_TOKEN_INVALID", "The verification link is invalid or expired.");
    }

    const tokens = await createSession(database, authUser(user), sessionMetadata(request));
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions);
    response.json({
      data: {
        user: serializeUser(user),
        accessToken: tokens.accessToken,
        recoveryCodes,
      },
    });
  });

  router.post("/login", rateLimiters.auth, async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { email: input.email },
      include: { settings: true },
    });
    const passwordMatches = await compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches) {
      throw new UnauthorizedError("The email address or password is incorrect.");
    }
    if (user.emailVerifiedAt === null) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email address before signing in.");
    }

    const tokens = await createSession(database, authUser(user), sessionMetadata(request));
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions);
    response.json({ data: { user: serializeUser(user), accessToken: tokens.accessToken } });
  });

  router.post("/password-reset/request", rateLimiters.auth, async (request, response) => {
    const input = emailRequestSchema.parse(request.body);
    const user = await database.user.findUnique({ where: { email: input.email } });
    let issuedToken: string | undefined;

    if (user?.emailVerifiedAt) {
      const issued = await replaceAccountToken(
        database,
        user.id,
        "PASSWORD_RESET",
        env.PASSWORD_RESET_TTL_MINUTES,
      );
      issuedToken = issued.token;
      try {
        await emailService.sendPasswordReset({
          name: user.name,
          to: user.email,
          url: accountUrl("/reset-password", issued.token),
        });
      } catch (error) {
        await database.accountToken.deleteMany({ where: { id: issued.record.id } });
        logger.error({ err: error, userId: user.id, requestId: request.id }, "Password reset email failed");
      }
    }

    response.status(202).json({
      data: {
        ...genericEmailResponse,
        ...(issuedToken ? developmentToken(issuedToken, "developmentResetToken") : {}),
      },
    });
  });

  router.post("/password-reset/confirm", rateLimiters.auth, async (request, response) => {
    const input = resetPasswordSchema.parse(request.body);
    const now = new Date();
    const record = await database.accountToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (
      !record ||
      record.type !== "PASSWORD_RESET" ||
      record.usedAt ||
      record.expiresAt <= now
    ) {
      throw new AppError(400, "RESET_TOKEN_INVALID", "The password reset link is invalid or expired.");
    }

    const passwordHash = await hashPassword(input.password);
    const changed = await database.$transaction(async (transaction) => {
      const consumed = await transaction.accountToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return false;
      await transaction.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await transaction.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.accountToken.deleteMany({
        where: { userId: record.userId, type: "PASSWORD_RESET", id: { not: record.id } },
      });
      return true;
    });

    if (!changed) {
      throw new AppError(400, "RESET_TOKEN_INVALID", "The password reset link is invalid or expired.");
    }
    response.clearCookie(REFRESH_COOKIE, clearCookieOptions);
    response.status(204).send();
  });

  router.post("/recover", rateLimiters.auth, async (request, response) => {
    const input = recoverSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const codeHash = recoveryCodeHash(input.recoveryCode);
    const user = await database.user.findUnique({
      where: { email: input.email },
      include: { recoveryCodes: { where: { usedAt: null } } },
    });
    const matchingCode = user?.recoveryCodes.find((code) =>
      tokenHashesMatch(code.codeHash, codeHash));

    if (!user || !matchingCode) {
      throw new UnauthorizedError("The recovery credentials are invalid.");
    }

    const now = new Date();
    const recovered = await database.$transaction(async (transaction) => {
      const consumed = await transaction.recoveryCode.updateMany({
        where: { id: matchingCode.id, userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return false;
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: now },
      });
      await transaction.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.accountToken.deleteMany({
        where: { userId: user.id, type: "PASSWORD_RESET" },
      });
      return true;
    });

    if (!recovered) throw new UnauthorizedError("The recovery credentials are invalid.");
    logger.warn(
      { userId: user.id, requestId: request.id, ...sessionMetadata(request) },
      "Account recovered with a backup code",
    );
    response.clearCookie(REFRESH_COOKIE, clearCookieOptions);
    response.status(204).send();
  });

  router.post("/recovery-codes", requireAuth, async (request, response) => {
    const input = regenerateCodesSchema.parse(request.body);
    const user = await database.user.findUnique({ where: { id: request.user!.id } });
    const passwordMatches = await compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) throw new UnauthorizedError("The current password is incorrect.");

    const recoveryCodes = generateRecoveryCodes();
    await database.$transaction(async (transaction) => {
      await transaction.recoveryCode.deleteMany({ where: { userId: user.id } });
      await transaction.recoveryCode.createMany({ data: recoveryCodeRows(user.id, recoveryCodes) });
    });
    response.json({ data: { recoveryCodes } });
  });

  router.post("/refresh", async (request, response) => {
    const currentToken = refreshTokenFromRequest(request);
    if (!currentToken) throw new UnauthorizedError("No refresh session was provided.");

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
      session.expiresAt <= new Date() ||
      session.user.emailVerifiedAt === null
    ) {
      throw new UnauthorizedError("The refresh session is invalid or expired.");
    }

    if (session.revokedAt) {
      await revokeAllSessions(database, session.userId);
      logger.warn(
        {
          userId: session.userId,
          sessionId: session.id,
          requestId: request.id,
          ...sessionMetadata(request),
        },
        "Refresh token reuse detected",
      );
      throw new UnauthorizedError("Refresh token reuse was detected. Please sign in again.");
    }

    const nextSessionId = randomUUID();
    const nextRefreshToken = signRefreshToken(session.userId, nextSessionId);
    const now = new Date();
    const rotated = await database.$transaction(async (transaction) => {
      const revoked = await transaction.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) return false;
      await transaction.refreshSession.create({
        data: {
          id: nextSessionId,
          userId: session.userId,
          tokenHash: hashToken(nextRefreshToken),
          expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1_000),
          ...sessionMetadata(request),
        },
      });
      return true;
    });

    if (!rotated) {
      await revokeAllSessions(database, session.userId);
      logger.warn(
        {
          userId: session.userId,
          sessionId: session.id,
          requestId: request.id,
          ...sessionMetadata(request),
        },
        "Concurrent refresh token reuse detected",
      );
      throw new UnauthorizedError("Refresh token reuse was detected. Please sign in again.");
    }

    const user = session.user as UserWithSettings;
    response.cookie(REFRESH_COOKIE, nextRefreshToken, cookieOptions);
    response.json({
      data: { user: serializeUser(user), accessToken: signAccessToken(authUser(user)) },
    });
  });

  router.post("/logout", async (request, response) => {
    const currentToken = refreshTokenFromRequest(request);
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
    response.clearCookie(REFRESH_COOKIE, clearCookieOptions);
    response.status(204).send();
  });

  router.get("/me", requireAuth, async (request, response) => {
    const user = await database.user.findUnique({
      where: { id: request.user!.id },
      include: { settings: true },
    });
    if (!user || user.emailVerifiedAt === null) {
      throw new UnauthorizedError("The authenticated account no longer exists.");
    }
    response.json({ data: { user: serializeUser(user) } });
  });

  return router;
}
