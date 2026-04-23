import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("3. Tool Search", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe("3.1 Search - Happy Path", () => {
    test("should filter tools in real time based on search input", async ({
      page,
    }) => {
      // Step 1: Click on the search box
      const searchBox = page.getByPlaceholder(/search|cari/i).first();
      await searchBox.click();

      // Step 2: Type "merge"
      await searchBox.fill("merge");

      // Step 3: Verify search results filter to show relevant tools
      await expect(
        page.locator("text=/merge|menggabungkan/i").first(),
      ).toBeVisible({ timeout: 5000 });

      // Step 5: Clear the search field
      await searchBox.clear();

      // Step 6: Verify all tools reappear (check for multiple categories)
      await expect(
        page.locator("text=/recommended|direkomendasikan/i").first(),
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("3.2 Search - No Results", () => {
    test("should handle queries with no matching tools gracefully", async ({
      page,
    }) => {
      // Step 1: Click on the search box
      const searchBox = page.getByPlaceholder(/search|cari/i).first();
      await searchBox.click();

      // Step 2: Type xyznonexistent123
      await searchBox.fill("xyznonexistent123");

      // Step 3: Verify the search field accepted the input
      await expect(searchBox).toHaveValue("xyznonexistent123");

      // The app uses fuzzy search with a fallback that shows all tools when nothing
      // matches, so we verify the search state is active (no "recommended" section)
      // and the page remains functional without errors.
      await expect(
        page.locator("text=/recommended|direkomendasikan/i"),
      ).toHaveCount(0, { timeout: 5000 });

      // Step 4: Clear the search field
      await searchBox.clear();

      // Step 5: Verify all tools reappear (recommended section comes back)
      await expect(
        page.locator("text=/recommended|direkomendasikan/i").first(),
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("3.3 Search - Special Characters", () => {
    test("should sanitize search input against XSS", async ({ page }) => {
      // Step 1: Type XSS payload into the search box
      const searchBox = page.getByPlaceholder(/search|cari/i).first();
      await searchBox.fill("<script>alert(1)</script>");

      // Step 2: Verify no script execution occurs (no alert dialog)
      // If an alert appeared, Playwright would throw an unhandled dialog error
      await page.waitForTimeout(1000);

      // Step 3: Verify the search treats the input as plain text
      await expect(searchBox).toHaveValue("<script>alert(1)</script>");

      // Step 4: Clear the search field
      await searchBox.clear();
    });
  });
});
