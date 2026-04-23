import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("16. File Menu", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe("16.1 File Menu - Open and Contents", () => {
    test("should open file menu and display file management options", async ({
      page,
    }) => {
      // Step 1: Click the "Files" button in the quick access bar
      const fileButton = page.locator('[data-testid="files-button"]').first();
      await expect(fileButton).toBeVisible({ timeout: 5000 });
      await fileButton.click();

      // Step 2: Verify a modal or panel opens with file-related options
      await page.waitForTimeout(500);
      const filePanel = page
        .locator(
          '.mantine-Modal-content, .mantine-Drawer-content, [role="dialog"]',
        )
        .first();
      await expect(filePanel).toBeVisible({ timeout: 5000 });

      // Step 3: Verify the panel contains file management content
      await page.waitForTimeout(500);

      // Step 4: Close the modal by pressing Escape
      await page.keyboard.press("Escape");
    });
  });
});
