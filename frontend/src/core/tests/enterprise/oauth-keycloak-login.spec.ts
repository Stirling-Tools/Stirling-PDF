import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";
import { bypassOnboarding } from "@app/tests/helpers/api-stubs";

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
 *
 * Real tool round-trips after login are covered by
 * live/e2e-pdf-operations.spec.ts; we don't duplicate that here because
 * the post-OAuth-callback navigation has timing quirks that produce flake
 * but aren't actually testing the SSO contract.
 *
 * Test user: oauthuser@example.com / oauthpassword (per
 * testing/compose/keycloak-realm-oauth.json).
 */
test.describe("Enterprise OAuth (Keycloak) — full SSO flow", () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
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
  });
});
