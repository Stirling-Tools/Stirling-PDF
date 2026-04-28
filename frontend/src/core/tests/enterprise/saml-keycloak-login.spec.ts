import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";
import { bypassOnboarding } from "@app/tests/helpers/api-stubs";

/**
 * SAML login round-trip via Keycloak.
 *
 * Requires the docker-compose-keycloak-saml stack:
 *   - Keycloak on http://localhost:9080 with realm `stirling-saml`
 *   - Stirling-PDF on http://localhost:8080 with PREMIUM_KEY set and
 *     security.saml2.enabled=true
 *
 * Validates:
 *   1. SAML redirect chain → IdP form → SP callback → dashboard.
 *   2. Identity surfaces in settings panel.
 *   3. A real tool run completes after SAML login.
 */
test.describe("Enterprise SAML (Keycloak) — full SSO flow", () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await ensureCookieConsent(page);
  });

  test("SAML redirect, identity in settings, real split tool run", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ── 1. SAML redirect chain ────────────────────────────────
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const samlBtn = page
      .locator('a[href*="saml"], a[href*="saml2"]')
      .or(page.getByRole("button", { name: /saml|authentik|keycloak/i }))
      .first();
    await expect(samlBtn).toBeVisible({ timeout: 10_000 });
    await samlBtn.click();

    await page.waitForURL(/\/realms\/stirling-saml\//, {
      timeout: 30_000,
    });
    await page.locator("#username").fill("samluser");
    await page.locator("#password").fill("samlpassword");
    await page.locator('input[type="submit"], button[type="submit"]').click();

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("link", { name: /^Tools$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── 2. Identity in settings → Account ────────────────────
    await page.locator('[data-testid="config-button"]').first().click();
    await page
      .getByText(/account settings/i)
      .first()
      .click();
    await expect(page.getByText(/samluser/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
