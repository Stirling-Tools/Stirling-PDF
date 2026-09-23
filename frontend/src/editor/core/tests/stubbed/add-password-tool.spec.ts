import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("9. Add Password Tool", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/add-password");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("9.1 Add Password - Multi-Step Form", () => {
    test("should display all configuration steps", async ({ page }) => {
      // Step 1: Verify a 3-step workflow: Files, Passwords & Encryption, Change Permissions
      await expect(page.getByText("Files").first()).toBeVisible();
      await expect(
        page.getByText(/Passwords?\s*&?\s*Encryption/i).first(),
      ).toBeVisible();
      await expect(page.getByText(/Change Permissions/i).first()).toBeVisible();

      // Step 2: Verify the Encrypt button is disabled
      const encryptButton = page
        .getByRole("button", { name: /encrypt/i })
        .first();
      await expect(encryptButton).toBeVisible();
      await expect(encryptButton).toBeDisabled();

      // Step 3: Verify the file upload area is present
      await expect(page.getByText(/upload/i).first()).toBeVisible();
    });
  });
});
