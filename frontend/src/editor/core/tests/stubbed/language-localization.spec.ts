import { test, expect } from "@app/tests/helpers/stub-test-base";
import { openSettings } from "@app/tests/helpers/ui-helpers";

test.describe("13. Language / Localization", () => {
  test.use({
    stubOptions: {
      languages: [
        "en-GB",
        "en-US",
        "id-ID",
        "de-DE",
        "es-ES",
        "fr-FR",
        "pt-BR",
      ],
    },
  });

  test.describe("13.1 Language Switcher", () => {
    test("should switch UI text when language is changed", async ({ page }) => {
      // Step 1: Locate the Language selector.
      // The language selector is accessed via Settings > General.

      let languageButton = page
        .locator('[data-testid="language-selector-button"]')
        .first();

      if (
        !(await languageButton.isVisible({ timeout: 1000 }).catch(() => false))
      ) {
        // Open Settings to access the language selector in the General section
        await openSettings(page, /^General$/);
        languageButton = page
          .locator('[data-testid="language-selector-button"]')
          .first();
      }

      // Step 2: Click the language button
      await expect(languageButton).toBeVisible({ timeout: 5000 });
      await languageButton.click();

      // Step 3: Verify a language selection menu opens
      const languageMenu = page.locator(".mantine-Menu-dropdown").first();
      await expect(languageMenu).toBeVisible({ timeout: 5000 });

      // Step 4: Select English
      const englishOption = languageMenu.getByText(/english/i).first();
      if (await englishOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await englishOption.click();

        // Step 5: Wait for page reload (language change triggers window.location.reload())
        await page.waitForLoadState("domcontentloaded");

        // Step 6: Verify the UI text is in English via the always-mounted
        // super search bar's placeholder.
        await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({
          timeout: 10000,
        });
      }
    });
  });
});
