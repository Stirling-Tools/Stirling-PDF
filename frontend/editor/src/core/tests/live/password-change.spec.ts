import { test, expect } from "@app/tests/helpers/test-base";
import {
  DEFAULT_TEST_PASSWORD,
  DEFAULT_TEST_USERNAME,
  loginAndSetup,
} from "@app/tests/helpers/login";

test.describe("21. Password Change Flow", () => {
  test.describe("21.1 Change Password", () => {
    test("should change password end-to-end", async ({ page, request }) => {
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
      const passwordModal = page.getByRole("dialog", {
        name: /Change password/i,
      });
      await expect(passwordModal).toBeVisible({ timeout: 5000 });

      // Step 3: Enter the current password
      await passwordModal
        .getByPlaceholder(/current password/i)
        .fill(DEFAULT_TEST_PASSWORD);

      // Step 4: Enter a new password
      await passwordModal
        .getByPlaceholder(/Enter a new password/i)
        .fill("adminadmin2");

      // Step 5: Confirm the new password
      await passwordModal.getByPlaceholder(/Re-enter/i).fill("adminadmin2");

      // Step 6: Submit the form - click "Update password" button inside the modal
      const modalSubmitBtn = passwordModal.getByRole("button", {
        name: /Update password/i,
      });
      await expect(modalSubmitBtn).toBeVisible({ timeout: 3000 });
      const changePasswordResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/user/change-password") &&
          response.request().method() === "POST",
      );
      await modalSubmitBtn.click();
      const changePasswordResponse = await changePasswordResponsePromise;
      expect(changePasswordResponse.ok()).toBeTruthy();

      // Wait until the UI finishes the logout triggered by the password change.
      await page.waitForURL(/\/login/, { timeout: 10_000 });

      // Restore the shared live-suite credentials so this mutation test does
      // not affect later specs in the same backend run.
      const login = await request.post("/api/v1/auth/login", {
        data: {
          username: DEFAULT_TEST_USERNAME,
          password: "adminadmin2",
        },
      });
      expect(login.ok()).toBeTruthy();
      const loginBody = (await login.json()) as {
        session?: { access_token?: string };
      };
      expect(loginBody.session?.access_token).toBeTruthy();

      const restore = await request.post("/api/v1/user/change-password", {
        headers: {
          Authorization: `Bearer ${loginBody.session?.access_token}`,
        },
        form: {
          currentPassword: "adminadmin2",
          newPassword: DEFAULT_TEST_PASSWORD,
        },
      });
      expect(restore.ok()).toBeTruthy();
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
      const passwordModal = page.getByRole("dialog", {
        name: /Change password/i,
      });
      await expect(passwordModal).toBeVisible({ timeout: 5000 });

      // Step 1: Enter the current password correctly
      await passwordModal
        .getByPlaceholder(/current password/i)
        .fill(DEFAULT_TEST_PASSWORD);

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
