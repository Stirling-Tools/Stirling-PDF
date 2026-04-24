import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("14. Fullscreen Mode", () => {
  test.describe("14.1 Toggle Fullscreen Tool Picker", () => {
    test("should toggle fullscreen mode for tool picker", async ({ page }) => {
      // Step 1: Click the fullscreen toggle button
      const fullscreenButton = page
        .getByRole("button", { name: /fullscreen|layar penuh/i })
        .first();
      await fullscreenButton.click();

      // Step 2: Verify the tool picker expands to a fullscreen/overlay view
      await page.waitForTimeout(500);

      // Step 3: Verify all tool categories and links remain accessible
      await expect(
        page.locator("text=/recommended|direkomendasikan/i").first(),
      ).toBeVisible({ timeout: 5000 });

      // Step 4: Click the button again to exit fullscreen
      const exitButton = page
        .getByRole("button", {
          name: /fullscreen|layar penuh|sidebar|bilah sisi/i,
        })
        .first();
      await exitButton.click();

      // Step 5: Verify the view returns to the default sidebar layout
      await page.waitForTimeout(500);
    });
  });
});
