import type { RequestHandler } from "express";
import { UnauthorizedError } from "../lib/errors.js";
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
