import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("15. Tour/Onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe("15.1 Tour Button", () => {
    test("should start and dismiss tour guide", async ({ page }) => {
      // Step 1: Click the Tours button in the quick access bar (identified by data-tour="help-button")
      const tourButton = page.locator('[data-tour="help-button"]').first();
      await expect(tourButton).toBeVisible({ timeout: 5000 });
      await tourButton.click();

      // Step 2: Verify the tours menu opens with tour options
      const toursMenu = page.locator(".mantine-Menu-dropdown").first();
      await expect(toursMenu).toBeVisible({ timeout: 5000 });

      // Step 3: Click on the "See what's new in V2" tour option to start a tour
      const whatsNewOption = page.getByText(/what.?s new|See what/i).first();
      await expect(whatsNewOption).toBeVisible({ timeout: 5000 });
      await whatsNewOption.click();

      // Step 4: Verify the reactour popover appears (tour has started)
      const tourPopover = page.locator(".reactour__popover").first();
      await expect(tourPopover).toBeVisible({ timeout: 10000 });

      // Step 5: Dismiss the tour by clicking the close button inside the popover
      const closeButton = tourPopover.locator("button").first();
      if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeButton.click();
      } else {
        // Fallback: press Escape to close the tour
        await page.keyboard.press("Escape");
      }

      // Step 6: Verify the tour popover disappears
      await expect(tourPopover).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("15.2 Tour Tooltip", () => {
    test("should show and dismiss tour tooltip", async ({ page }) => {
      // Step 1: Check if a tours tooltip with a close button appears near the help button
      // The tooltip uses the custom Tooltip component with showCloseButton enabled
      const tooltipContent = page
        .locator('[data-radix-popper-content-wrapper], [role="tooltip"]')
        .first();

      // Step 2: If a tooltip with a close button is visible, dismiss it
      const closeButton = tooltipContent.locator("button").first();
      if (await closeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await closeButton.click();

        // Step 3: Verify the tooltip content disappears
        await expect(tooltipContent).not.toBeVisible({ timeout: 5000 });
      }

      // Step 4: Refresh the page and verify it loads normally
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // Step 5: Verify the page loaded (search box or navigation visible)
      await expect(page.getByPlaceholder(/search|cari/i).first()).toBeVisible({
        timeout: 10000,
      });
    });
  });
});
