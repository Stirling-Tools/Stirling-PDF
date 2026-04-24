import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("23. Two-Factor Authentication", () => {
  test.describe("23.1 Enable 2FA", () => {
    test("should initiate 2FA setup flow", async ({ page }) => {
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

      // Step 1: Click "Enable two-factor authentication"
      const enable2FAButton = page.getByRole("button", {
        name: /Enable two-factor authentication/i,
      });
      await expect(enable2FAButton).toBeVisible({ timeout: 5000 });
      await enable2FAButton.click();

      // Step 2: Verify a 2FA setup dialog appears with the heading
      const twoFAHeading = page.getByRole("heading", {
        name: /two-factor authentication/i,
      });
      await expect(twoFAHeading).toBeVisible({ timeout: 10000 });

      // Step 3: Verify instructions mention scanning the QR code
      await expect(page.getByText(/Scan the QR code/i).first()).toBeVisible({
        timeout: 5000,
      });

      // Step 4: Verify the manual setup key is provided
      await expect(page.getByText(/Manual setup key/i).first()).toBeVisible({
        timeout: 5000,
      });

      // Step 5: Verify the authentication code input is present
      await expect(page.getByPlaceholder(/Enter 6-digit code/i)).toBeVisible({
        timeout: 5000,
      });
    });
  });
});
