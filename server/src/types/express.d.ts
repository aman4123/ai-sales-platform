import type { AuthenticatedUser } from "../modules/auth/auth.tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    id: string;
    user?: AuthenticatedUser;
  }
}
