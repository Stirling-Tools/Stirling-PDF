import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

/**
 * OAuth login round-trip via Keycloak.
 *
 * Requires the docker-compose-keycloak-oauth stack to be running:
 *   - Keycloak on http://localhost:9080 with realm `stirling-oauth`
 *   - Stirling-PDF on http://localhost:8080 with PREMIUM_KEY set
 *
 * Validates:
 *   1. SSO redirect → IdP form → callback → dashboard rendering.
 *   2. The authenticated user identity surfaces in the settings panel
 *      (matches the Keycloak account, not just "someone logged in").
 *   3. A real tool run completes after SSO login (merge two PDFs).
 *
 * Test user: oauthuser@example.com / oauthpassword (per
 * testing/compose/keycloak-realm-oauth.json).
 */
test.describe("Enterprise OAuth (Keycloak) — full SSO flow", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-set the bypassOnboarding flag so welcome/analytics modals
    // never render and intercept tool clicks. The orchestrator reads
    // sessionStorage on every render, so this needs to fire before
    // every navigation in the test.
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("onboarding::bypass-all", "true");
        localStorage.setItem("onboarding::completed", "true");
        localStorage.setItem("onboarding::tours-tooltip-shown", "true");
      } catch {
        /* ignore — quota etc */
      }
    });
    await ensureCookieConsent(page);
  });

  test("SSO redirect, identity in settings, real merge tool run", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ── 1. SSO redirect chain ────────────────────────────────
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const keycloakBtn = page
      .locator('a[href*="oauth2/authorization/keycloak"]')
      .or(page.getByRole("button", { name: /keycloak|continue with/i }))
      .first();
    await expect(keycloakBtn).toBeVisible({ timeout: 10_000 });
    await keycloakBtn.click();

    await page.waitForURL(/\/realms\/stirling-oauth\/protocol\/openid-connect/);
    await page.locator("#username").fill("oauthuser@example.com");
    await page.locator("#password").fill("oauthpassword");
    await page.locator('input[type="submit"], button[type="submit"]').click();

    // Back on Stirling-PDF, authenticated dashboard renders
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("link", { name: /^Tools$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── 2. Identity surfaced in settings → Account ────────────
    await page.locator('[data-testid="config-button"]').first().click();
    await page
      .getByText(/account settings/i)
      .first()
      .click();
    await expect(page.getByText(/oauthuser/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ── 3. Real merge tool run ────────────────────────────────
    await page.goto("/merge");
    await page.waitForLoadState("domcontentloaded");

    await page.getByTestId("files-button").click();
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "visible",
      timeout: 5_000,
    });
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles([SAMPLE_PDF, SAMPLE_PDF]);
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "hidden",
      timeout: 10_000,
    });

    const goToEditor = page.getByRole("button", {
      name: /go to file editor/i,
    });
    if (await goToEditor.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await goToEditor.click();
    }

    const runBtn = page.locator('[data-tour="run-button"]');
    await expect(runBtn).toBeEnabled({ timeout: 15_000 });
    await runBtn.click();

    // Merge result lands in the review panel
    await expect(
      page.locator('[data-testid="review-panel-container"]'),
    ).toBeVisible({ timeout: 60_000 });
  });
});
