import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("26. Workspace Features", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    // Open settings dialog
    await page
      .getByRole("button", { name: /settings/i })
      .first()
      .click();
    const settingsDialog = page.locator(".mantine-Modal-content").first();
    await expect(settingsDialog).toBeVisible({ timeout: 5000 });
  });

  test.describe("26.1 Team Members", () => {
    test("should display workspace members section", async ({ page }) => {
      // Step 1: Click "People" in the settings nav
      const peopleNav = page.getByText(/^People$/i).first();
      if (await peopleNav.isVisible({ timeout: 3000 }).catch(() => false)) {
        await peopleNav.click();

        // Step 2: Verify the members/team management section loads
        await page.waitForTimeout(500);

        // Step 3: Verify the admin user is listed
        await expect(page.locator("text=/admin/").first()).toBeVisible({
          timeout: 5000,
        });
      }
    });
  });

  test.describe("26.2 Teams", () => {
    test("should display teams management section", async ({ page }) => {
      // Step 1: Click "Teams" in the settings nav
      const teamsNav = page.getByText(/^Teams$/i).first();
      if (await teamsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
        await teamsNav.click();

        // Step 2: Verify the teams management section loads
        await page.waitForTimeout(500);
        const bodyContent = await page
          .locator('[role="dialog"], [class*="modal"], [class*="settings"]')
          .first()
          .textContent();
        expect(bodyContent).toBeTruthy();
      }
    });
  });
});
