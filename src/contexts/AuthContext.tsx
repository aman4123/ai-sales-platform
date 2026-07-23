import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, refreshSession, setAccessToken } from "../services/api";
import type { AuthPayload, AuthUser } from "../types/api";
import { AuthContext, type AuthContextValue } from "./auth-context";
let initialSession: Promise<AuthPayload> | null = null;

function bootstrapSession() {
  initialSession ??= refreshSession();
  return initialSession;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const expire = () => setUser(null);
    window.addEventListener("auth:expired", expire);

    void bootstrapSession()
      .then((session) => {
        if (active) setUser(session.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.removeEventListener("auth:expired", expire);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const response = await api.post<{ data: AuthPayload }>("/auth/login", { email, password });
        setAccessToken(response.data.data.accessToken);
        setUser(response.data.data.user);
      },
      async register(name, email, password) {
        const response = await api.post<{ data: AuthPayload }>("/auth/register", {
          name,
          email,
          password,
        });
        setAccessToken(response.data.data.accessToken);
        setUser(response.data.data.user);
      },
      async logout() {
        try {
          await api.post("/auth/logout");
        } finally {
          setAccessToken(null);
          setUser(null);
        }
      },
      updateUser: setUser,
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
