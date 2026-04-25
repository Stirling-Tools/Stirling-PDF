import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("11. Automation Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("11.1 Automation - Suggested Workflows", () => {
    test("should display saved and suggested workflows", async ({ page }) => {
      // Step 1: Verify the Automate link in the navigation is visible
      const automateLink = page.locator('a[href="/automate"]').first();
      await expect(automateLink).toBeVisible();

      // Step 2: Verify the Automation Selection header is present
      await expect(
        page.getByText(/Automation Selection/i).first(),
      ).toBeVisible();

      // If we accidentally landed on the creation step, click back to selection
      const selectionHeader = page.getByText(/Automation Selection/i).first();
      const savedText = page.getByText(/Saved/i).first();
      if (!(await savedText.isVisible().catch(() => false))) {
        await selectionHeader.click();
        await page.waitForTimeout(500);
      }

      // Step 3: Verify the Saved section is visible
      await expect(page.getByText("Saved").first()).toBeVisible();

      // Step 4: Verify the Create New Automation entry is present
      await expect(
        page.getByText(/Create New Automation/i).first(),
      ).toBeVisible();

      // Step 5: Verify suggested preset workflows are listed
      await expect(page.getByText("Suggested").first()).toBeVisible();

      const suggestedWorkflows = [
        /Secure PDF Ingestion/i,
        /Pre-publish Sanitization/i,
        /Email Preparation/i,
        /Security Workflow/i,
        /Process Images/i,
      ];

      for (const workflow of suggestedWorkflows) {
        await expect(page.getByText(workflow).first()).toBeVisible({
          timeout: 5000,
        });
      }
    });
  });

  test.describe("11.2 Automation - Create New Automation", () => {
    test("should open automation builder when clicking create button", async ({
      page,
    }) => {
      // Ensure we're on the selection step first
      const savedText = page.getByText("Saved").first();
      if (!(await savedText.isVisible().catch(() => false))) {
        const selectionHeader = page.getByText(/Automation Selection/i).first();
        await selectionHeader.click();
        await page.waitForTimeout(500);
      }

      // Step 1: Click the Create New Automation entry
      const createEntry = page.getByText(/Create New Automation/i).first();
      await createEntry.click();

      // Step 2: Verify the automation builder/editor opens with form fields
      await expect(page.getByText(/Create Automation/i).first()).toBeVisible({
        timeout: 5000,
      });

      // Step 3: Verify the user can see automation configuration fields
      await expect(page.getByText(/Automation Name/i).first()).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText(/Add Tool/i).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Save Automation/i }).first(),
      ).toBeVisible();
    });
  });
});
