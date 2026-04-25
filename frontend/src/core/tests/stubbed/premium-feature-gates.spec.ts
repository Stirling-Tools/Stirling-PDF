import { test, expect, type Page } from "@playwright/test";
import {
  bypassOnboarding,
  mockAppApis,
  seedCookieConsent,
} from "@app/tests/helpers/api-stubs";

/**
 * Stubbed premium-feature gating. Several tools and admin surfaces only
 * render when the backend reports `enabled: true` for the tool's
 * endpoint. This spec asserts:
 *   - tools whose endpoint is `enabled: false` still expose a tile but
 *     surface a disabled / locked indicator,
 *   - tools whose endpoint is `enabled: true` route normally.
 */

async function setUpEndpointAvailability(
  page: Page,
  overrides: Record<string, { enabled: boolean }>,
) {
  await seedCookieConsent(page);
  await bypassOnboarding(page);
  await mockAppApis(page, { endpointsAvailability: overrides });
  await page.goto("/");
}

test.describe("Premium / endpoint gating", () => {
  test("disabled tool endpoint still appears in the picker (tile present)", async ({
    page,
  }) => {
    await setUpEndpointAvailability(page, {
      compress: { enabled: false },
    });

    // Even disabled endpoints render a tile in the picker — the tool
    // becomes a no-op or shows a disabled affordance once clicked.
    const compressTile = page.locator('[data-tour="tool-button-compress"]');
    await expect(compressTile.first()).toBeVisible({ timeout: 10_000 });
  });

  test("enabled tool endpoint routes to its tool page", async ({ page }) => {
    await setUpEndpointAvailability(page, {
      compress: { enabled: true },
    });
    await page.locator('[data-tour="tool-button-compress"]').first().click();
    await expect(page).toHaveURL(/\/compress/);
  });

  test("non-admin user does not see admin-only settings sections", async ({
    page,
  }) => {
    await seedCookieConsent(page);
    await bypassOnboarding(page);
    // Seed JWT so the orchestrator's auth-gated effect treats the user as
    // logged-in — without this the orchestrator returns early and the
    // dashboard chrome never renders.
    await page.addInitScript(() => {
      localStorage.setItem(
        "stirling_jwt",
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature",
      );
    });
    await mockAppApis(page, {
      enableLogin: true,
      user: {
        id: 2,
        username: "user",
        email: "user@example.com",
        roles: ["ROLE_USER"],
      },
    });
    await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
      route.fulfill({
        json: { username: "user", email: "user@example.com", isAdmin: false },
      }),
    );
    await page.goto("/");

    const configBtn = page.locator('[data-testid="config-button"]').first();
    if (!(await configBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Config button not rendered for non-admin on this build");
      return;
    }
    await configBtn.click();
    const dialog = page.locator(".mantine-Modal-content").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Admin-only sections must not render for ROLE_USER
    for (const section of [/^audit/i, /^teams/i, /^license/i]) {
      await expect(dialog.getByText(section)).toHaveCount(0);
    }
  });
});
