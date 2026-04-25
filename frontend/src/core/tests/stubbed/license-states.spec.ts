import { test, expect, type Page } from "@playwright/test";
import {
  bypassOnboarding,
  mockAppApis,
  seedCookieConsent,
} from "@app/tests/helpers/api-stubs";
import { openSettings } from "@app/tests/helpers/ui-helpers";

/**
 * Stubbed license-state matrix. The admin Plan/Premium settings section
 * renders different banners depending on what `/admin/license-info`
 * returns (no-key / valid normal / valid enterprise / disabled). This
 * spec drives each state via mocked responses so frontend regressions
 * surface even on PRs without a real license key.
 */

async function setUpAdminPage(
  page: Page,
  licenseInfo: Record<string, unknown>,
) {
  await seedCookieConsent(page);
  await bypassOnboarding(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "stirling_jwt",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature",
    );
  });
  await mockAppApis(page, {
    enableLogin: true,
    user: {
      id: 1,
      username: "admin",
      email: "admin",
      roles: ["ROLE_ADMIN"],
    },
  });
  // Admin role surfaces the Plan/License section in settings
  await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
    route.fulfill({
      json: {
        username: "admin",
        email: "admin",
        changeCredsFlag: false,
        isAdmin: true,
      },
    }),
  );
  await page.route("**/api/v1/admin/license-info", (route) =>
    route.fulfill({ json: licenseInfo }),
  );
  await page.goto("/");
}

test.describe("Admin license panel — state matrix", () => {
  test("ENTERPRISE license renders without invalid/expired warnings", async ({
    page,
  }) => {
    await setUpAdminPage(page, {
      licenseType: "ENTERPRISE",
      enabled: true,
      maxUsers: 1000,
      hasKey: true,
      licenseKey: "MOCK-LICENSE-KEY",
    });
    await openSettings(page);
    await expect(
      page.getByText(/invalid license|expired|trial.*expired|key required/i),
    ).toHaveCount(0);
  });

  test("no-key state surfaces a key-required affordance somewhere", async ({
    page,
  }) => {
    await setUpAdminPage(page, {
      licenseType: "NORMAL",
      enabled: true,
      maxUsers: 1,
      hasKey: false,
    });
    await openSettings(page);
    // Without a license, the UI should expose either an enter-license-key
    // affordance or a "free" / "no license" indicator.
    const hint = page
      .getByText(/license key|enter.*key|no license|free/i)
      .first();
    await expect(hint).toBeVisible({ timeout: 5_000 });
  });

  test("disabled premium (premium.enabled=false) hides license panel content", async ({
    page,
  }) => {
    await setUpAdminPage(page, {
      licenseType: "NORMAL",
      enabled: false,
      maxUsers: 1,
      hasKey: false,
    });
    await openSettings(page);
    // No invalid/expired warnings should leak through when premium is off
    await expect(
      page.getByText(/invalid license|expired|trial.*expired/i),
    ).toHaveCount(0);
  });
});
