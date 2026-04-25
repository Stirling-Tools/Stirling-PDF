import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";

/**
 * OAuth login round-trip via Keycloak.
 *
 * Requires the docker-compose-keycloak-oauth stack to be running:
 *   - Keycloak on http://localhost:9080 with realm `stirling-oauth`
 *   - Stirling-PDF on http://localhost:8080 with PREMIUM_KEY set
 *
 * Test user: oauthuser@example.com / oauthpassword (per
 * testing/compose/keycloak-realm-oauth.json).
 */
test.describe("Enterprise OAuth login (Keycloak)", () => {
  test("clicking the Keycloak provider redirects, authenticates, and lands on home", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await ensureCookieConsent(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    // The login page shows OAuth buttons rendered from app-config.oauth2
    const keycloakBtn = page
      .locator('a[href*="oauth2/authorization/keycloak"]')
      .or(page.getByRole("button", { name: /keycloak|continue with/i }))
      .first();
    await expect(keycloakBtn).toBeVisible({ timeout: 10_000 });
    await keycloakBtn.click();

    // We are now on the Keycloak login page (different origin)
    await page.waitForURL(/\/realms\/stirling-oauth\/protocol\/openid-connect/);

    await page.locator("#username").fill("oauthuser@example.com");
    await page.locator("#password").fill("oauthpassword");
    await page.locator('input[type="submit"], button[type="submit"]').click();

    // Back on Stirling-PDF, authenticated
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("link", { name: /^Tools$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
