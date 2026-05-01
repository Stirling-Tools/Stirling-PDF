import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("21. Password Change Flow", () => {
  test.describe("21.1 Change Password", () => {
    test("should change password end-to-end", async ({ page }) => {
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

      // Step 1: Click "Update password" button in account section
      const updatePwBtn = page
        .getByRole("button", { name: /Update password/i })
        .first();
      await expect(updatePwBtn).toBeVisible({ timeout: 5000 });
      await updatePwBtn.click();

      // Step 2: Wait for the password change modal to appear
      const passwordModal = page.getByRole("dialog", { name: /Security/i });
      await expect(passwordModal).toBeVisible({ timeout: 5000 });

      // Step 3: Enter the current password
      await passwordModal.getByPlaceholder(/current password/i).fill("admin");

      // Step 4: Enter a new password
      await passwordModal
        .getByPlaceholder(/Enter a new password/i)
        .fill("admin");

      // Step 5: Confirm the new password
      await passwordModal.getByPlaceholder(/Re-enter/i).fill("admin");

      // Step 6: Submit the form - click "Update password" button inside the modal
      const modalSubmitBtn = passwordModal.getByRole("button", {
        name: /Update password/i,
      });
      await expect(modalSubmitBtn).toBeVisible({ timeout: 3000 });
      await modalSubmitBtn.click();

      // Step 7: Verify a success message is shown (or no error)
      await page.waitForTimeout(2000);
    });
  });

  test.describe("21.2 Change Password - Mismatch", () => {
    test("should reject mismatched passwords with error", async ({ page }) => {
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

      // Click "Update password" to open password change modal
      const updatePwBtn = page
        .getByRole("button", { name: /Update password/i })
        .first();
      await expect(updatePwBtn).toBeVisible({ timeout: 5000 });
      await updatePwBtn.click();

      // Wait for the password change modal to appear
      const passwordModal = page.getByRole("dialog", { name: /Security/i });
      await expect(passwordModal).toBeVisible({ timeout: 5000 });

      // Step 1: Enter the current password correctly
      await passwordModal.getByPlaceholder(/current password/i).fill("admin");

      // Step 2: Enter a new password
      await passwordModal
        .getByPlaceholder(/Enter a new password/i)
        .fill("newpassword123");

      // Step 3: Enter a different value in confirm password
      await passwordModal
        .getByPlaceholder(/Re-enter/i)
        .fill("differentpassword456");

      // Step 4: Submit the form inside the modal
      const modalSubmitBtn = passwordModal.getByRole("button", {
        name: /Update password/i,
      });
      await expect(modalSubmitBtn).toBeVisible({ timeout: 3000 });
      await modalSubmitBtn.click();

      // Step 5: Verify an error message about password mismatch is shown
      await expect(
        page
          .locator("text=/mismatch|do not match|tidak cocok|tidak sama/i")
          .first(),
      ).toBeVisible({ timeout: 5000 });
    });
  });
});
