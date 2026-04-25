import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";

/**
 * SAML login round-trip via Keycloak.
 *
 * Requires the docker-compose-keycloak-saml stack:
 *   - Keycloak on http://localhost:9080 with realm `stirling-saml`
 *   - Stirling-PDF on http://localhost:8080 with PREMIUM_KEY set and
 *     security.saml2.enabled=true
 */
test.describe("Enterprise SAML login (Keycloak)", () => {
  test("SAML provider button completes the IdP redirect and signs the user in", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await ensureCookieConsent(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const samlBtn = page
      .locator('a[href*="saml"], a[href*="saml2"]')
      .or(page.getByRole("button", { name: /saml|authentik|keycloak/i }))
      .first();
    await expect(samlBtn).toBeVisible({ timeout: 10_000 });
    await samlBtn.click();

    await page.waitForURL(/\/realms\/stirling-saml\/protocol\/saml/, {
      timeout: 30_000,
    });

    await page.locator("#username").fill("samluser@example.com");
    await page.locator("#password").fill("samlpassword");
    await page.locator('input[type="submit"], button[type="submit"]').click();

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("link", { name: /^Tools$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
