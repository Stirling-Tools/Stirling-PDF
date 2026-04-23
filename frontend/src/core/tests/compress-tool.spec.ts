import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("8. Compress Tool", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await page.goto("/compress");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("8.1 Compress - Page Structure", () => {
    test("should load correctly with disabled action button", async ({
      page,
    }) => {
      // Step 1: Verify the page shows the Files and Settings steps
      await expect(page.getByText("Files").first()).toBeVisible();
      await expect(page.getByText("Settings").first()).toBeVisible();

      // Step 2: Verify the "Compress" button is present and disabled
      const compressButton = page
        .getByRole("button", { name: /compress/i })
        .first();
      await expect(compressButton).toBeVisible();
      await expect(compressButton).toBeDisabled();

      // Step 3: Verify the file upload area is displayed
      await expect(page.getByText(/upload/i).first()).toBeVisible();
    });
  });
});
