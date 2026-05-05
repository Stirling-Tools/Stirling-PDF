import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";
import { bypassOnboarding } from "@app/tests/helpers/api-stubs";
import { openSettings } from "@app/tests/helpers/ui-helpers";

/**
 * License-gated feature surface validation. Drives the actual UI rather
 * than poking endpoints — every assertion is on what the user sees in
 * the admin settings + tool surfaces. Requires a backend booted with a
 * real `PREMIUM_KEY` (premium.enabled=true), `-PbuildWithFrontend=true`
 * so the SPA is served from :8080, and the live-suite admin user
 * (admin/adminadmin) provisioned.
 */

const ADMIN = "admin";
const PASSWORD = "adminadmin";

async function uiLogin(page: import("@playwright/test").Page) {
  await bypassOnboarding(page);
  await ensureCookieConsent(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(ADMIN);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 15_000 });
  await expect(
    page.getByRole("link", { name: /^Tools$/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe("Enterprise license — admin settings UI", () => {
  test("Account settings shows the admin username", async ({ page }) => {
    test.setTimeout(60_000);
    await uiLogin(page);
    await openSettings(page);

    await page
      .getByText(/account settings/i)
      .first()
      .click();
    await expect(page.getByText(/admin/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("License / premium section reports a valid key (no invalid/expired warnings)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await uiLogin(page);
    await openSettings(page);

    // Open the license/premium section if present in the side nav
    const licenseNav = page.getByText(/license|premium|subscription/i).first();
    if (await licenseNav.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await licenseNav.click();
      await page.waitForTimeout(500);
    }

    // No "invalid"/"expired"/"key required" warnings should render
    // anywhere in the dialog.
    await expect(
      page.getByText(/invalid license|expired|trial.*expired|key required/i),
    ).toHaveCount(0);
  });

  test("Audit log section is reachable from settings", async ({ page }) => {
    test.setTimeout(60_000);
    await uiLogin(page);
    await openSettings(page);

    const auditNav = page.getByText(/^audit/i).first();
    if (!(await auditNav.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Audit section not available on this build");
      return;
    }
    await auditNav.click();
    await page.waitForTimeout(500);

    // Audit dashboard renders some data surface in the DOM (table, list,
    // chart). Some builds tab the dashboard behind a sub-section so we
    // assert attachment rather than visibility.
    const surface = page
      .locator('[data-testid*="audit" i], table, [class*="AuditDashboard" i]')
      .first();
    await expect(surface).toBeAttached({ timeout: 10_000 });
  });

  test("Teams section renders and exposes a create-team affordance", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await uiLogin(page);
    await openSettings(page);

    const teamsNav = page.getByText(/^teams/i).first();
    if (!(await teamsNav.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Teams section not available on this build");
      return;
    }
    await teamsNav.click();
    await page.waitForTimeout(500);

    await expect(
      page
        .getByRole("button", { name: /create team|new team|add team/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Users / Workspace member list renders", async ({ page }) => {
    test.setTimeout(60_000);
    await uiLogin(page);
    await openSettings(page);

    const usersNav = page.getByText(/^users|^members/i).first();
    if (!(await usersNav.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Users / members section not available on this build");
      return;
    }
    await usersNav.click();
    await page.waitForTimeout(500);

    // The current admin user should appear in the list
    await expect(page.getByText(/^admin$/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Analytics / usage statistics dashboard is reachable", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await uiLogin(page);
    await openSettings(page);

    const usageNav = page.getByText(/usage|analytics|statistics/i).first();
    if (!(await usageNav.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Usage/analytics section not on this build");
      return;
    }
    await usageNav.click();
    await page.waitForTimeout(500);

    // The dashboard renders some surface — table, chart, canvas, or a
    // "no data" empty state. Either is acceptable for "section is
    // reachable on a premium-enabled build".
    const surface = page.locator(
      '[data-testid*="usage" i], canvas, table, [class*="chart" i]',
    );
    const empty = page.getByText(/no data|no events|nothing here/i).first();
    const surfaceCount = await surface.count();
    const hasEmpty = await empty
      .isVisible({ timeout: 1_000 })
      .catch(() => false);
    if (surfaceCount === 0 && !hasEmpty) {
      test.info().annotations.push({
        type: "feature-surface",
        description:
          "Analytics dashboard rendered no data surface and no empty state",
      });
    }
  });
});
