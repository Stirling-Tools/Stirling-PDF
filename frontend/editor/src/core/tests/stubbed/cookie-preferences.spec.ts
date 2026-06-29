import { test, expect } from "@app/tests/helpers/stub-test-base";
import { openSettings } from "@app/tests/helpers/ui-helpers";

test.describe("18. Cookie Preferences", () => {
  test.describe("18.1 Cookie Banner", () => {
    test("should open and configure cookie preferences from Settings → Legal", async ({
      page,
    }) => {
      // Analytics must be enabled for the Cookie Preferences button to render
      await page.route("**/api/v1/ui-data/footer-info", (route) =>
        route.fulfill({ json: { analyticsEnabled: true } }),
      );
      await page.goto("/");

      // Step 1: The "Cookie Preferences" button lives in Settings → Legal
      await openSettings(page);
      const legalNav = page.locator('[data-tour="admin-legal-nav"]').first();
      await expect(legalNav).toBeVisible({ timeout: 5000 });
      await legalNav.click();

      const cookieButton = page.locator("#cookieBanner").first();
      await expect(cookieButton).toBeVisible({ timeout: 10000 });

      // The consent library lazy-loads when the Legal section mounts
      await page.waitForFunction(
        () => (window as unknown as { CookieConsent?: unknown }).CookieConsent,
        { timeout: 10000 },
      );
      await page.waitForTimeout(500);

      // Step 2: Click the button — it opens the detailed preferences dialog
      // directly. No force: the click must land with the settings modal open,
      // proving the dialog stacks above it.
      await cookieButton.click();

      // Step 3: Verify the preferences dialog opens inside #cc-main
      const ccMain = page.locator("#cc-main");
      const prefsDialog = ccMain.locator(".pm").first();
      await expect(prefsDialog).toBeVisible({ timeout: 5000 });

      // Step 4: Verify the dialog sits above the settings modal
      // (Z_INDEX_CONFIG_MODAL = 1400)
      const zIndex = await page.evaluate(() => {
        const el = document.querySelector("#cc-main");
        return el ? Number(getComputedStyle(el).zIndex) : -1;
      });
      expect(zIndex).toBeGreaterThan(1400);

      // Step 5: Verify the preferences panel shows cookie categories
      const necessaryCategory = ccMain
        .locator("text=/Strictly Necessary|necessary/i")
        .first();
      const analyticsCategory = ccMain.locator("text=/Analytics/i").first();
      await expect(necessaryCategory.or(analyticsCategory).first()).toBeVisible(
        { timeout: 3000 },
      );

      // Step 6: Expand all sections and verify the dialog body wheel-scrolls
      // while the settings modal is open (regression: the modal's
      // react-remove-scroll lock swallowed wheel events on the dialog)
      const expanders = ccMain.locator(
        ".pm__section--expandable .pm__section-title",
      );
      const expanderCount = await expanders.count();
      for (let i = 0; i < expanderCount; i++) {
        await expanders.nth(i).click();
      }
      const dialogBody = ccMain.locator(".pm__body").first();
      const canScroll = await dialogBody.evaluate(
        (el) => el.scrollHeight > el.clientHeight,
      );
      if (canScroll) {
        const box = await dialogBody.boundingBox();
        await page.mouse.move(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2,
        );
        await page.mouse.wheel(0, 300);
        await expect
          .poll(() => dialogBody.evaluate((el) => el.scrollTop), {
            timeout: 3000,
          })
          .toBeGreaterThan(0);
        await dialogBody.evaluate((el) => {
          el.scrollTop = 0;
        });
      }

      // Step 7: Accept all (or save) to close — again without force
      const acceptAllBtn = ccMain
        .locator('button:has-text("Accept all")')
        .first();
      const savePrefBtn = ccMain
        .locator('button:has-text("Save preferences")')
        .first();

      if (await acceptAllBtn.isVisible().catch(() => false)) {
        await acceptAllBtn.click();
      } else {
        await savePrefBtn.click();
      }

      // Step 8: Verify the dialog is dismissed
      await expect(prefsDialog).toBeHidden({ timeout: 5000 });
    });
  });
});
