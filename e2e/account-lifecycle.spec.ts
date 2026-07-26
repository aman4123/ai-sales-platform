import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { registerAndOpenDashboard, uniqueEmail } from "./helpers.js";

test("registers, verifies email, preserves the session, and passes a dashboard accessibility scan", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("approved outreach");
  await page.getByRole("link", { name: "Start Free" }).first().click();
  await expect(page).toHaveURL(/\/register$/);

  const email = uniqueEmail("account", test.info().project.name);
  await registerAndOpenDashboard(page, email);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open profile" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("rejects invalid login without creating an authenticated session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("missing-user@example.test");
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
