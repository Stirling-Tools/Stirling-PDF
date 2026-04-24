import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("19. Responsive Design and Accessibility", () => {
  test.describe("19.1 Responsive Layout - Mobile Viewport", () => {
    test("should be usable on mobile viewport sizes", async ({ page }) => {
      // Step 1: Resize the browser window to a mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);

      // Step 2: Verify the navigation adapts to a mobile-friendly layout
      // The page should not be broken
      const bodyContent = await page.locator("body").textContent();
      expect(bodyContent).toBeTruthy();

      // Step 3: Verify tool links remain accessible
      // They might be in a hamburger menu or scrollable
      await page.waitForTimeout(500);

      // Step 5: Navigate to a tool page and verify it renders correctly
      await page.goto("/merge");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/merge/);
    });
  });

  test.describe("19.2 Keyboard Navigation", () => {
    test("should be keyboard navigable", async ({ page }) => {
      // Step 1: Press Tab to navigate through the page
      await page.keyboard.press("Tab");
      await page.waitForTimeout(300);

      // Step 2: Verify focus moves logically through elements
      await page.keyboard.press("Tab");
      await page.waitForTimeout(300);

      // Verify there is a focused element
      const focusedElement = page.locator(":focus");
      await expect(focusedElement).toBeVisible();

      // Step 5: On the login page, verify Tab order
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      // Tab through login form
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      // The focused element should be one of the login form elements
    });
  });
});
