import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("6. Split Tool", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await page.goto("/split");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("6.1 Split - Method Selection", () => {
    test("should display all split methods", async ({ page }) => {
      // Step 1: Verify the page shows a multi-step workflow (Files and Choose Method)
      await expect(page.locator("text=/^Files$|^File$/i").first()).toBeVisible({
        timeout: 10000,
      });
      await expect(
        page.locator("text=/Choose Method|Method/i").first(),
      ).toBeVisible();

      // Step 2: Verify the following split methods are listed as cards
      // Each card shows "prefix name" e.g. "Split at Page Numbers"
      const splitMethods = [
        /Page Numbers/i,
        /Chapters/i,
        /Sections/i,
        /File Size/i,
        /Page Count/i,
        /Document Count/i,
        /Page Divider/i,
        /Printable Chunks/i,
      ];

      for (const method of splitMethods) {
        await expect(page.getByText(method).first()).toBeVisible({
          timeout: 5000,
        });
      }

      // Step 3: Verify the "Split" button is disabled
      const splitButton = page
        .getByRole("button", { name: /split|pisahkan/i })
        .first();
      await expect(splitButton).toBeVisible();
      await expect(splitButton).toBeDisabled();
    });
  });

  test.describe("6.2 Split - Submit Without File", () => {
    test("should not allow split without a file", async ({ page }) => {
      // Step 1: Select a split method by clicking a method card
      const firstMethod = page.getByText(/Page Numbers/i).first();
      if (await firstMethod.isVisible({ timeout: 3000 })) {
        await firstMethod.click();
      }

      // Step 2: Verify the "Split" button remains disabled without a file uploaded
      const splitButton = page
        .getByRole("button", { name: /split|pisahkan/i })
        .first();
      await expect(splitButton).toBeDisabled();
    });
  });
});
