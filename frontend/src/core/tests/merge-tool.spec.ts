import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("5. Merge Tool", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await page.goto("/merge");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("5.1 Merge - Page Structure", () => {
    test("should display the correct multi-step workflow", async ({ page }) => {
      // Step 1: Verify the page title/tool shows "Merge"
      await expect(
        page.locator("text=/merge|menggabungkan/i").first(),
      ).toBeVisible();

      // Step 2: Verify a 3-step workflow is displayed (Files, Sort Files, Settings)
      await expect(page.locator("text=/^Files$|^File$/i").first()).toBeVisible({
        timeout: 10000,
      });
      await expect(
        page.locator("text=/Sort Files|Sort/i").first(),
      ).toBeVisible();
      await expect(
        page.locator("text=/Settings|Pengaturan/i").first(),
      ).toBeVisible();

      // Step 3: Verify the "Merge" button is present and disabled
      const mergeButton = page
        .getByRole("button", { name: /merge|gabungkan/i })
        .first();
      await expect(mergeButton).toBeVisible();
      await expect(mergeButton).toBeDisabled();

      // Step 4: Verify the file upload drop zone is visible
      await expect(
        page
          .locator('[class*="upload"], [class*="dropzone"], input[type="file"]')
          .first(),
      ).toBeVisible();
    });
  });

  test.describe("5.2 Merge - Submit Without Files", () => {
    test("should not allow merge without uploading files", async ({ page }) => {
      // Step 1: Verify the "Merge" button is disabled
      const mergeButton = page
        .getByRole("button", { name: /merge|gabungkan/i })
        .first();
      await expect(mergeButton).toBeDisabled();

      // Step 2-3: Attempt to interact without uploading files
      // The workflow should not proceed without files
      await mergeButton.click({ force: true });
      await expect(page).toHaveURL(/\/merge/);
    });
  });
});
