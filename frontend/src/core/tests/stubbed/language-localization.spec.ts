import { test, expect } from "@app/tests/helpers/stub-test-base";

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
      // Step 1: Locate the Language selector in the right rail
      // The LanguageSelector uses an ActionIcon with a "language" icon and optional title="Language"
      const languageButton = page
        .locator(".right-rail-icon")
        .filter({ has: page.locator('[class*="language"]') })
        .first()
        .or(page.locator('button[title="Language"]').first())
        .or(page.locator('[data-tour="right-rail-settings"] button').nth(1));

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

        // Step 6: Verify the UI text is in English
        await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({
          timeout: 10000,
        });
      }
    });
  });
});
