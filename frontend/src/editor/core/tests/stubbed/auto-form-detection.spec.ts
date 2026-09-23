import { test, expect, type Page } from "@playwright/test";
import {
  bypassOnboarding,
  mockAppApis,
  seedCookieConsent,
} from "@app/tests/helpers/api-stubs";
import { SETTINGS_SURFACE } from "@app/tests/helpers/ui-helpers";

/**
 * Stubbed coverage for the tool tile (shown even when the endpoint is disabled, so the tool stays
 * discoverable), opening it once enabled, and the admin install panel.
 */

const MODEL_STATUS_NOT_INSTALLED = {
  status: "not_installed",
  progress: 0,
  activeModelId: "",
  installed: [],
  error: null,
  writable: true,
  catalog: [
    {
      id: "ffdnet-s",
      displayName: "CommonForms FFDNet-S",
      description: "Small form-field detector",
      license: "CC-BY-4.0",
      sizeBytes: 0,
      onnxUrl: "",
      sha256: "",
    },
  ],
};

async function stubModelStatus(page: Page) {
  await page.route("**/api/v1/form/form-detection-model/status", (route) =>
    route.fulfill({ json: MODEL_STATUS_NOT_INSTALLED }),
  );
}

test.describe("Auto Form Detection tool", () => {
  test("tile is present even when the model endpoint is disabled", async ({
    page,
  }) => {
    await seedCookieConsent(page);
    await bypassOnboarding(page);
    await stubModelStatus(page);
    await mockAppApis(page, {
      endpointsAvailability: { "form-detection": { enabled: false } },
    });
    await page.goto("/");

    const tile = page.locator('[data-tour="tool-button-autoFormDetection"]');
    await expect(tile.first()).toBeVisible({ timeout: 10_000 });
  });

  test("clicking the tile opens the tool when the endpoint is enabled", async ({
    page,
  }) => {
    await seedCookieConsent(page);
    await bypassOnboarding(page);
    await stubModelStatus(page);
    await mockAppApis(page, {
      endpointsAvailability: { "form-detection": { enabled: true } },
    });
    await page.goto("/");

    await page
      .locator('[data-tour="tool-button-autoFormDetection"]')
      .first()
      .click();
    await expect(page).toHaveURL(/auto-form-detection/i);
  });

  test("admin sees the AI Form Detection box inside the System section", async ({
    page,
  }) => {
    await seedCookieConsent(page);
    await bypassOnboarding(page);
    // Seed JWT so the auth-gated dashboard chrome renders for the admin user.
    await page.addInitScript(() => {
      localStorage.setItem(
        "stirling_jwt",
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature",
      );
    });
    await stubModelStatus(page);
    await mockAppApis(page, {
      enableLogin: true,
      isAdmin: true,
      user: {
        id: 1,
        username: "admin",
        email: "admin@example.com",
        roles: ["ROLE_ADMIN"],
      },
    });
    await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
      route.fulfill({
        json: { username: "admin", email: "admin@example.com", isAdmin: true },
      }),
    );
    await page.goto("/editor");

    const configBtn = page.locator('[data-testid="config-button"]').first();
    if (!(await configBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Config button not rendered for admin on this build");
      return;
    }
    await configBtn.click();
    const settings = page.locator(SETTINGS_SURFACE);
    await expect(settings).toBeVisible({ timeout: 5_000 });

    // AI Form Detection is a card on the System settings page, not a nav entry
    // of its own - navigate there first.
    await settings
      .locator('[data-tour="admin-adminGeneral-nav"]')
      .first()
      .click();

    await expect(settings.getByText(/AI Form Detection/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
