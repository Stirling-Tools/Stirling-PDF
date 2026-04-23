import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("18. Cookie Preferences", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe("18.1 Cookie Banner", () => {
    test("should open and configure cookie preferences from footer", async ({
      page,
    }) => {
      // Step 1: Locate the "Cookie Preferences" button in the footer
      const cookieButton = page
        .locator(
          '#cookieBanner, button:has-text("Preferensi Cookie"), button:has-text("Cookie Preferences")',
        )
        .first();

      await page.waitForTimeout(1000);
      const isVisible = await cookieButton.isVisible().catch(() => false);
      if (!isVisible) {
        test.skip(
          true,
          "Cookie Preferences button not visible — analytics may be disabled",
        );
        return;
      }

      await expect(cookieButton).toBeVisible();

      // Step 2: Click the Cookie Preferences button
      await cookieButton.click({ force: true });

      // Step 3: Verify the cookie consent dialog opens
      // The CookieConsent library renders inside #cc-main
      const ccMain = page.locator("#cc-main");
      const consentDialog = ccMain.getByRole("dialog").first();
      await expect(consentDialog).toBeVisible({ timeout: 5000 });

      // Step 4: Verify options are available
      // The initial consent view shows: "Oke", "Tidak, terima kasih", "Kelola preferensi"
      const okeBtn = ccMain
        .locator('button:has-text("Oke"), button:has-text("OK")')
        .first();
      const noThanksBtn = ccMain
        .locator(
          'button:has-text("Tidak, terima kasih"), button:has-text("No Thanks")',
        )
        .first();
      const manageBtn = ccMain
        .locator(
          'button:has-text("Kelola preferensi"), button:has-text("Manage preferences")',
        )
        .first();

      const hasOke = await okeBtn.isVisible().catch(() => false);
      const hasNoThanks = await noThanksBtn.isVisible().catch(() => false);
      const hasManage = await manageBtn.isVisible().catch(() => false);

      expect(hasOke || hasNoThanks || hasManage).toBe(true);

      // Step 5: Click "Kelola preferensi" to open the detailed preferences panel
      if (hasManage) {
        await manageBtn.click();
        await page.waitForTimeout(500);

        // Verify the preferences panel shows cookie categories
        const necessaryCategory = ccMain
          .locator(
            "text=/Cookie yang Sangat Diperlukan|Strictly Necessary|necessary/i",
          )
          .first();
        const analyticsCategory = ccMain
          .locator("text=/Analitik|Analytics/i")
          .first();
        await expect(
          necessaryCategory.or(analyticsCategory).first(),
        ).toBeVisible({ timeout: 3000 });

        // Click "Terima semua" (Accept all) or "Simpan preferensi" (Save preferences) to close
        const acceptAllBtn = ccMain
          .locator(
            'button:has-text("Terima semua"), button:has-text("Accept all")',
          )
          .first();
        const savePrefBtn = ccMain
          .locator(
            'button:has-text("Simpan preferensi"), button:has-text("Save preferences")',
          )
          .first();

        if (await acceptAllBtn.isVisible().catch(() => false)) {
          await acceptAllBtn.click();
        } else if (await savePrefBtn.isVisible().catch(() => false)) {
          await savePrefBtn.click();
        }
      } else if (hasOke) {
        await okeBtn.click();
      } else if (hasNoThanks) {
        await noThanksBtn.click();
      }

      // Step 6: Verify the dialog is dismissed
      await expect(consentDialog).toBeHidden({ timeout: 5000 });
    });
  });
});
