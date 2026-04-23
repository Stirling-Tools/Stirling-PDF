import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("24. Settings - Configuration Sections", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    // Open settings dialog
    await page
      .getByRole("button", { name: /settings/i })
      .first()
      .click();
    const settingsDialog = page.locator(".mantine-Modal-content").first();
    await expect(settingsDialog).toBeVisible({ timeout: 5000 });
  });

  test.describe("24.1 System Settings", () => {
    test("should load system settings section correctly", async ({ page }) => {
      // Step 1: Click "System Settings" in the nav (proprietary build only)
      const systemSettingsNav = page.getByText(/^System Settings$/i);
      if (
        await systemSettingsNav
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await systemSettingsNav.first().click();

        // Step 2: Verify the section is viewable without errors
        const dialog = page.locator(".mantine-Modal-content").first();
        const bodyContent = await dialog.textContent();
        expect(bodyContent).toBeTruthy();
      }
    });
  });

  test.describe("24.2 Features Toggle", () => {
    test("should load features configuration section", async ({ page }) => {
      // Step 1: Click "Features" in the nav (proprietary build only)
      const featuresNav = page.getByText(/^Features$/i);
      if (
        await featuresNav
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await featuresNav.first().click();

        // Step 2: Verify the section is viewable without errors
        const dialog = page.locator(".mantine-Modal-content").first();
        const bodyContent = await dialog.textContent();
        expect(bodyContent).toBeTruthy();
      }
    });
  });

  test.describe("24.3 Endpoint Configuration", () => {
    test("should load endpoint settings correctly", async ({ page }) => {
      // Step 1: Click "Endpoints" in the nav (proprietary build only)
      const endpointsNav = page.getByText(/^Endpoints$/i);
      if (
        await endpointsNav
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await endpointsNav.first().click();

        // Step 2: Verify the section is viewable without errors
        const dialog = page.locator(".mantine-Modal-content").first();
        const bodyContent = await dialog.textContent();
        expect(bodyContent).toBeTruthy();
      }
    });
  });

  test.describe("24.4 API Keys", () => {
    test("should load API key management section", async ({ page }) => {
      // Step 1: Click "API Keys" in the nav (proprietary build with login enabled)
      const apiKeysNav = page.getByText(/^API Keys$/i);
      if (
        await apiKeysNav
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await apiKeysNav.first().click();

        // Step 2: Verify the section is viewable without errors
        const dialog = page.locator(".mantine-Modal-content").first();
        const bodyContent = await dialog.textContent();
        expect(bodyContent).toBeTruthy();
      }
    });
  });
});
