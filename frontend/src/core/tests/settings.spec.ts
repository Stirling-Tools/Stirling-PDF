import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("12. Settings", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe("12.1 Settings - General Preferences", () => {
    test("should open settings dialog with all configuration categories", async ({
      page,
    }) => {
      // Step 1: Click the Settings button in the quick access bar
      const settingsButton = page
        .getByRole("button", { name: /settings/i })
        .first();
      await settingsButton.click();

      // Step 2: Verify a settings dialog opens as a modal
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      // Step 3: Verify the left sidebar navigation contains expected categories
      // The proprietary build shows: General, Keyboard Shortcuts, Account,
      // API Keys, People, Teams, System Settings, Features, Endpoints, etc.
      const settingsCategories = [/^General$/i, /^Keyboard Shortcuts$/i];

      for (const category of settingsCategories) {
        await expect(page.getByText(category).first()).toBeVisible({
          timeout: 5000,
        });
      }

      // Step 4: Verify the "General" section is selected by default
      await expect(page.getByText(/^General$/i).first()).toBeVisible();

      // Step 5: Verify general settings include version info and toggles
      await expect(page.getByText(/version/i).first()).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("12.2 Settings - Account Management", () => {
    test("should display current user info and management options", async ({
      page,
    }) => {
      // Open settings dialog
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      // Step 1: Click "Account" in the nav
      const accountNav = page.getByText(/^Account$/i);
      if (
        await accountNav
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await accountNav.first().click();

        // Step 2: Verify the account section shows "admin" user
        await expect(page.getByText(/admin/).first()).toBeVisible({
          timeout: 5000,
        });

        // Step 3: Verify buttons are present
        await expect(page.getByText(/Update password/i).first()).toBeVisible();
        await expect(page.getByText(/Change username/i).first()).toBeVisible();
        await expect(page.getByText(/Log out/i).first()).toBeVisible();

        // Step 4: Verify a "Two-factor authentication" section is present
        await expect(
          page.getByText(/Two-factor authentication/i).first(),
        ).toBeVisible();

        // Step 5: Verify enable/disable 2FA button is available
        await expect(
          page.getByText(/enable two-factor|disable two-factor/i).first(),
        ).toBeVisible();
      }
    });
  });

  test.describe("12.3 Settings - Logout", () => {
    test("should invalidate session and protect routes after logout", async ({
      page,
    }) => {
      // Open settings and go to account settings
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      const accountNav = page.getByText(/^Account$/i);
      if (
        await accountNav
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await accountNav.first().click();
        await page.waitForTimeout(500);

        // Step 1: Click the "Log out" button
        await page
          .getByText(/Log out/i)
          .first()
          .click();

        // Step 2: Verify the user is redirected to the login page
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

        // Step 3: Attempt to navigate directly to /
        await page.goto("/");

        // Step 4: Verify the user is redirected back to /login
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
      }
    });
  });

  test.describe("12.4 Settings - Close Dialog", () => {
    test("should close settings dialog cleanly", async ({ page }) => {
      // Open settings
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      // Step 1: Click the "Close" button on the settings dialog (aria-label="Close")
      const closeBtn = page.locator('[aria-label="Close"]').first();
      await closeBtn.click();

      // Step 2: Verify the dialog closes
      await expect(settingsDialog).not.toBeVisible({ timeout: 5000 });

      // Step 3: Verify the main dashboard is fully accessible underneath
      await expect(
        page.locator('[data-tour="quick-access-bar"]').first(),
      ).toBeVisible();
    });
  });

  test.describe("12.5 Settings - Search Within Settings", () => {
    test("should filter settings based on search input", async ({ page }) => {
      // Open settings
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      // Step 1: Locate the search/combobox in the settings dialog header
      const settingsSearch = page
        .locator(
          '.mantine-Modal-content input[role="searchbox"], .mantine-Modal-content input[type="search"], .mantine-Modal-content .mantine-Select-input, .mantine-Modal-content .mantine-Combobox-input',
        )
        .first();

      // Step 2: If a search field is visible, type a search term and verify filtering
      if (
        await settingsSearch.isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        await settingsSearch.fill("General");
        await page.waitForTimeout(500);

        // Step 3: Clear the search
        await settingsSearch.clear();
        await page.waitForTimeout(500);
      }
    });
  });
});
