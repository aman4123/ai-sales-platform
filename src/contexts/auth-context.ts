import { createContext, useContext } from "react";
import type { AuthPayload, AuthUser, RegistrationPayload } from "../types/api";

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<RegistrationPayload>;
  acceptSession(session: AuthPayload): void;
  logout(): Promise<void>;
  updateUser(user: AuthUser): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
