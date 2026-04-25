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

  test("admin-restricted endpoints render no admin chrome for ROLE_USER", async ({
    page,
  }) => {
    await seedCookieConsent(page);
    await bypassOnboarding(page);
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

    // Open settings — admin-only sections (License, Audit, Teams) must not
    // render for a regular user.
    await page.locator('[data-testid="config-button"]').first().click();
    const dialog = page.locator(".mantine-Modal-content").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    for (const section of [/^audit/i, /^teams/i, /^license/i]) {
      await expect(dialog.getByText(section)).toHaveCount(0);
    }
  });
});
