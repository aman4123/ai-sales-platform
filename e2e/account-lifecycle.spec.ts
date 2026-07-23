import { expect, test, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

async function registerAndOpenDashboard(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Browser Test User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("browser-test-password");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByRole("link", { name: "Open development verification link" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await page.getByRole("button", { name: "Verify email" }).click();

  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(8);
  await page.getByRole("link", { name: "Continue to dashboard" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
}

test("registers, verifies email, saves recovery codes, and opens the dashboard", async ({ page }) => {
  const email = `browser-${Date.now()}-${test.info().project.name}@example.com`;
  await registerAndOpenDashboard(page, email);

  await expect(page.getByRole("heading", { name: /Welcome Back/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open profile" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("persists the core CRM, settings, research, and email workflow", async ({ page }) => {
  const email = `workflow-${Date.now()}-${test.info().project.name}@example.com`;
  await registerAndOpenDashboard(page, email);

  await page.goto("/crm");
  await page.getByLabel("Company", { exact: true }).fill("Workflow Industries");
  await page.getByLabel("Contact", { exact: true }).fill("Jordan Lee");
  await page.getByLabel("Deal value", { exact: true }).fill("25000");
  await page.getByRole("button", { name: "+ Add Lead" }).click();
  await expect(page.getByText("Lead added.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Workflow Industries Jordan Lee/ })).toBeVisible();

  await page.goto("/settings");
  await page.getByLabel("Full Name").fill("Persisted Browser User");
  await page.getByLabel("Company", { exact: true }).fill("Workflow Industries");
  await page.getByLabel("Default Signature").fill("Regards, Browser User");
  await page.getByRole("button", { name: "💾 Save Settings" }).click();
  await expect(page.getByText("Settings Saved Successfully!")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Full Name")).toHaveValue("Persisted Browser User");
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue("Workflow Industries");

  await page.goto("/research");
  await page.getByLabel("Research request").fill("Research Workflow Industries");
  await page.getByRole("button", { name: "🔍 Research" }).click();
  await expect(page.getByText("Company: Example Technologies Pvt Ltd")).toBeVisible();

  await page.goto("/email");
  await page.getByLabel("Company name").fill("Workflow Industries");
  await page.getByLabel("Contact name").fill("Jordan Lee");
  await page.getByLabel("Industry").fill("Manufacturing");
  await page.getByRole("button", { name: "Generate Email" }).click();
  await expect(page.getByLabel("Generated email")).toHaveValue(/Subject: Helping Workflow Industries/);
});
