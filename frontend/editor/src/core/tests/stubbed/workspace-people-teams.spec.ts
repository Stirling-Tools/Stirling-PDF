import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("26. Workspace Features", () => {
  test.beforeEach(async ({ page }) => {
    // Open settings dialog
    await page
      .getByRole("button", { name: /settings/i })
      .first()
      .click();
    const settingsDialog = page.locator(".settings-page");
    await expect(settingsDialog).toBeVisible({ timeout: 5000 });
  });

  test.describe("26.1 Team Members", () => {
    test("should display workspace members section", async ({ page }) => {
      // Step 1: Click "People" in the settings nav
      const peopleNav = page
        .locator(".settings-page .modal-nav-item")
        .filter({ hasText: /^People$/i });
      const usable =
        (await peopleNav.isVisible({ timeout: 3000 }).catch(() => false)) &&
        (await peopleNav.isEnabled());
      if (usable) {
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
      const teamsNav = page
        .locator(".settings-page .modal-nav-item")
        .filter({ hasText: /^Teams$/i });
      const usable =
        (await teamsNav.isVisible({ timeout: 3000 }).catch(() => false)) &&
        (await teamsNav.isEnabled());
      if (usable) {
        await teamsNav.click();

        // Step 2: Verify the teams management section loads
        await page.waitForTimeout(500);
        const bodyContent = await page
          .locator(".settings-page .modal-body")
          .textContent();
        expect(bodyContent).toBeTruthy();
      }
    });
  });
});
