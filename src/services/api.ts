import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios";
import type { AuthPayload } from "../types/api";

interface ApiEnvelope<T> {
  data: T;
}

interface RetriableRequest extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

const baseURL = import.meta.env.VITE_API_URL || "/api";
const supportStorageKey = "ai-sales-support-context";
let accessToken: string | null = null;
let refreshPromise: Promise<AuthPayload> | null = null;

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 30_000,
  headers: { "content-type": "application/json" },
});

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export interface SupportContext {
  sessionId: string;
  targetUserName: string;
  tenantName: string;
  accessLevel: "READ_ONLY" | "WRITE";
  expiresAt: string;
}

export function getSupportContext(): SupportContext | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(supportStorageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SupportContext;
    if (!parsed.sessionId || new Date(parsed.expiresAt) <= new Date()) {
      window.localStorage.removeItem(supportStorageKey);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(supportStorageKey);
    return null;
  }
}

export function setSupportContext(context: SupportContext | null) {
  if (typeof window === "undefined") return;
  if (context) window.localStorage.setItem(supportStorageKey, JSON.stringify(context));
  else window.localStorage.removeItem(supportStorageKey);
  window.dispatchEvent(new Event("support:changed"));
}

export function refreshSession(): Promise<AuthPayload> {
  if (!refreshPromise) {
    const performRefresh = () => axios
      .post<ApiEnvelope<AuthPayload>>(`${baseURL}/auth/refresh`, {}, {
        withCredentials: true,
        timeout: 15_000,
      })
      .then((response) => {
        setAccessToken(response.data.data.accessToken);
        return response.data.data;
      });
    const coordinatedRefresh = navigator.locks
      ? navigator.locks.request("ai-sales-session-refresh", performRefresh)
      : performRefresh();

    refreshPromise = coordinatedRefresh
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set("authorization", `Bearer ${accessToken}`);
  }
  const support = getSupportContext();
  if (support) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set("x-support-session-id", support.sessionId);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequest | undefined;
    const isSessionMutation = [
      "/auth/login",
      "/auth/register",
      "/auth/refresh",
      "/auth/logout",
      "/auth/verify-email",
      "/auth/verification/request",
      "/auth/password-reset/request",
      "/auth/password-reset/confirm",
      "/auth/recover",
    ]
      .some((path) => request?.url?.endsWith(path));

    if (
      error.response?.status === 401 &&
      request &&
      !request._retriedAfterRefresh &&
      !isSessionMutation
    ) {
      request._retriedAfterRefresh = true;
      try {
        const session = await refreshSession();
        request.headers = AxiosHeaders.from(request.headers);
        request.headers.set("authorization", `Bearer ${session.accessToken}`);
        return api(request);
      } catch {
        setAccessToken(null);
        window.dispatchEvent(new Event("auth:expired"));
      }
    }

    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message ?? error.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
