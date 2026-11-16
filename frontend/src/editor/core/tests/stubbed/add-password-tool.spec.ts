import { test, expect } from "@editor/tests/helpers/stub-test-base";

test.describe("9. Add Password Tool", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/add-password");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("9.1 Add Password - Multi-Step Form", () => {
    test("should display all configuration steps", async ({ page }) => {
      await expect(page.getByText("Files").first()).toBeVisible();
      await expect(
        page.getByText("Password to open", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Restrict actions", { exact: true }),
      ).toBeVisible();

      const saveButton = page.getByRole("button", {
        name: "Save protection",
        exact: true,
      });
      await expect(saveButton).toBeVisible();
      await expect(saveButton).toBeDisabled();

      await expect(page.getByText(/upload/i).first()).toBeVisible();
    });
  });
});
