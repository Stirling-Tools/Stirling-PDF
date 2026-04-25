import { test, expect } from "@playwright/test";
import { ensureCookieConsent } from "@app/tests/helpers/login";
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
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("onboarding::bypass-all", "true");
        localStorage.setItem("onboarding::completed", "true");
        localStorage.setItem("onboarding::tours-tooltip-shown", "true");
      } catch {
        /* ignore */
      }
    });
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

    // Upload before selecting a method (cards/options only render
    // after the workbench has a file).
    await page.getByTestId("files-button").click();
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "visible",
      timeout: 5_000,
    });
    await page.locator('[data-testid="file-input"]').setInputFiles(SAMPLE_PDF);
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "hidden",
      timeout: 10_000,
    });

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

    const runBtn = page.locator('[data-tour="run-button"]');
    await expect(runBtn).toBeEnabled({ timeout: 15_000 });
    await runBtn.click();

    // Result lands in the review panel — visible review = backend processed
    // the request successfully under the SAML user's session.
    await expect(
      page.locator('[data-testid="review-panel-container"]'),
    ).toBeVisible({ timeout: 60_000 });
  });
});
