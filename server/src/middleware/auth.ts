import type { RequestHandler } from "express";
import { AppError, UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";

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
  if (!request.user || !["ADMIN", "SUPER_ADMIN"].includes(request.user.role)) {
    next(new AppError(403, "ADMIN_REQUIRED", "Administrator access is required."));
    return;
  }
  next();
};

export const requireSuperAdmin: RequestHandler = (request, _response, next) => {
  if (request.user?.role !== "SUPER_ADMIN") {
    next(new AppError(403, "SUPER_ADMIN_REQUIRED", "Super administrator access is required."));
    return;
  }
  next();
};
