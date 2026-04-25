import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";
import { bypassOnboarding } from "@app/tests/helpers/api-stubs";
import {
  uploadFiles,
  runToolAndWaitForReview,
} from "@app/tests/helpers/ui-helpers";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

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
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ── 3. Real split tool run ───────────────────────────────
    await page.goto("/split");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    // Pick page-numbers split method
    await page
      .getByText(/Page Numbers/i)
      .first()
      .click();
    const rangesInput = page
      .getByPlaceholder(/Custom Page Selection|pages/i)
      .first();
    if (await rangesInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rangesInput.fill("1");
    }

    await runToolAndWaitForReview(page);
  });
});
