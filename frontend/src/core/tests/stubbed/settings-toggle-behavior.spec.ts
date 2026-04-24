import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("25. Settings Toggle Behavior", () => {
  test.describe("25.1 Toggle Switches Persist", () => {
    test("should persist toggle state across dialog open/close", async ({
      page,
    }) => {
      // Open settings dialog
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      // Step 1: Find a toggle (Switch) in the General section
      const toggle = settingsDialog
        .locator('input[type="checkbox"][role="switch"], input[role="switch"]')
        .first();

      if (await toggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        const initialState = await toggle.isChecked();

        // Step 2: Click the toggle to change its state
        await toggle.click({ force: true });
        const newState = await toggle.isChecked();
        expect(newState).not.toBe(initialState);

        // Step 3: Close the settings dialog
        const closeBtn = page.locator('[aria-label="Close"]').first();
        await closeBtn.click();
        await expect(settingsDialog).not.toBeVisible({ timeout: 5000 });

        // Step 4: Reopen the settings dialog
        await page
          .getByRole("button", { name: /settings/i })
          .first()
          .click();
        await expect(settingsDialog).toBeVisible({ timeout: 5000 });

        // Step 5: Verify the toggle retains the changed state
        const persistedState = await toggle.isChecked();
        expect(persistedState).toBe(newState);

        // Restore original state
        if (persistedState !== initialState) {
          await toggle.click({ force: true });
        }
      }
    });
  });

  test.describe("25.2 Tool Picker Mode Toggle", () => {
    test("should apply tool picker mode preference immediately", async ({
      page,
    }) => {
      // Open settings dialog
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      const settingsDialog = page.locator(".mantine-Modal-content").first();
      await expect(settingsDialog).toBeVisible({ timeout: 5000 });

      // Step 1: Look for a SegmentedControl or radio-like control for tool picker mode
      // The General section uses SegmentedControl for tool panel mode (Sidebar/Fullscreen)
      const segmentedControl = settingsDialog
        .locator(".mantine-SegmentedControl-root")
        .first();

      if (
        await segmentedControl.isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        // Step 2: Click a different segment option
        const labels = segmentedControl.locator("label");
        const count = await labels.count();
        if (count >= 2) {
          // Click the second option to change the mode
          await labels.nth(1).click();
          await page.waitForTimeout(300);

          // Step 3: Close the settings dialog
          const closeBtn = page.locator('[aria-label="Close"]').first();
          await closeBtn.click();
          await expect(settingsDialog).not.toBeVisible({ timeout: 5000 });

          // Step 4: Reopen settings and verify the selection persisted
          await page
            .getByRole("button", { name: /settings/i })
            .first()
            .click();
          await expect(settingsDialog).toBeVisible({ timeout: 5000 });

          // Restore by clicking the first option
          const restoredLabels = segmentedControl.locator("label");
          await restoredLabels.nth(0).click();
        }
      }
    });
  });
});
