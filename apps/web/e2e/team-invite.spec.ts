import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

/**
 * A teammate who doesn't have an account yet opens their invitation, creates an
 * account, lands back on the invitation (not in onboarding), and joins the team.
 */

const password = () => `E2e-${randomBytes(9).toString("base64url")}1`;

test("team invite: register from the invitation and return to accept it", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const companyName = `Invite Test ${stamp}`;

  // Admin: register, create the company, invite a teammate.
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Ada Admin");
  await page.getByLabel("Work email").fill(`admin-${stamp}@nova.test`);
  await page.getByLabel("Password").fill(password());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Company name").fill(companyName);
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByRole("heading", { name: /AI employee/i }).first()).toBeVisible();

  await page.goto("/settings/team");
  const teammate = `teammate-${stamp}@nova.test`;
  await page.getByLabel("Email address").fill(teammate);
  await page.getByRole("button", { name: "Send invite" }).click();
  const link = await page.getByLabel("Invite link (also emailed)").inputValue();
  const invitePath = new URL(link).pathname;
  expect(invitePath).toMatch(/^\/invite\/[A-Za-z0-9_-]{40,}$/);

  // Teammate (signed out): open the link and create an account from it.
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(invitePath);
  await expect(guest.getByRole("heading", { name: `Join ${companyName}` })).toBeVisible();
  await guest.getByRole("link", { name: "Create an account" }).click();
  await expect(guest).toHaveURL(/\/register\?next=/);
  await expect(guest.getByRole("heading", { name: `Join ${companyName}` })).toBeVisible();
  await expect(guest.getByLabel("Work email")).toHaveValue(teammate);
  await guest.getByLabel("Full name").fill("Tom Teammate");
  await guest.getByLabel("Password").fill(password());
  await guest.getByRole("button", { name: "Create account" }).click();

  // Back on the invitation — not in onboarding — and able to accept it.
  await expect(guest).toHaveURL(new RegExp(`${invitePath}$`));
  await guest.getByRole("button", { name: "Accept invitation" }).click();
  await expect(guest).toHaveURL(/\/home$/);
  await expect(guest.getByText(companyName).first()).toBeVisible();
  await context.close();
});
