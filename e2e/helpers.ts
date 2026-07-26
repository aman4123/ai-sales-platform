import { createHmac } from "node:crypto";
import { expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

export const E2E_PASSWORD = "browser-test-password";
export const API_ORIGIN = "http://127.0.0.1:4000/api";
const E2E_WEBHOOK_SECRET = "e2e-webhook-secret-that-is-longer-than-thirty-two-characters";

export function signedWebhook(payload: Record<string, unknown>, secret = E2E_WEBHOOK_SECRET) {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(data)
    .digest("hex");
  return {
    data,
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": `sha256=${signature}`,
    },
  };
}

export function uniqueEmail(prefix: string, project: string) {
  return `${prefix}-${project}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

export async function registerAndOpenDashboard(page: Page, email: string, name = "Browser Test User") {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Account created");
  await page.getByRole("link", { name: "Open development verification link" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(8);
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function loginToken(request: APIRequestContext, email: string) {
  const response = await request.post(`${API_ORIGIN}/auth/login`, {
    data: { email, password: E2E_PASSWORD },
  });
  expect(response.status(), await response.text()).toBe(200);
  const payload = await response.json() as { data: { accessToken: string } };
  return payload.data.accessToken;
}

export async function apiRequest<T>(
  request: APIRequestContext,
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  expectedStatus = 200,
) {
  const response = await request.fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.status(), await response.text()).toBe(expectedStatus);
  return response.json() as Promise<T>;
}

export async function responseError(response: APIResponse) {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}
