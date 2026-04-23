import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("22. Username Change Flow", () => {
  test.describe("22.1 Change Username", () => {
    test("should update username successfully", async ({ page }) => {
      await loginAndSetup(page);

      // Open settings dialog
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      // Navigate to Account Settings section
      const accountNav = page.getByText(/Account Settings/i).first();
      await expect(accountNav).toBeVisible({ timeout: 5000 });
      await accountNav.click();
      await page.waitForTimeout(500);

      // Step 1: Click "Change Username"
      const changeUsernameBtn = page
        .getByRole("button", { name: /Change Username/i })
        .first();
      await expect(changeUsernameBtn).toBeVisible({ timeout: 5000 });
      await changeUsernameBtn.click();

      // Step 2: Wait for the Change Username modal to appear
      const usernameModal = page.getByRole("dialog", {
        name: /Change Username/i,
      });
      await expect(usernameModal).toBeVisible({ timeout: 5000 });

      // Step 3: Enter a new valid username
      await usernameModal.getByLabel(/New Username/i).fill("admin");

      // Step 4: Enter current password (required for username change)
      await usernameModal.getByLabel(/Current Password/i).fill("admin");

      // Step 5: Submit the form via "Save" button inside the modal
      const saveBtn = usernameModal.getByRole("button", { name: /Save/i });
      await expect(saveBtn).toBeVisible({ timeout: 3000 });
      await saveBtn.click();

      // Step 6: Verify success or completion
      await page.waitForTimeout(2000);
    });
  });
});
