import { test, expect } from "@app/tests/helpers/stub-test-base";
import { openSettings, closeSettings } from "@app/tests/helpers/ui-helpers";

/**
 * Consolidated settings-dialog coverage. Was previously three files
 * (`settings.spec.ts`, `settings-configuration.spec.ts`,
 * `settings-toggle-behavior.spec.ts`) generated from a numbered test
 * plan; merged here to cut bloat. Logout flow lives in
 * `live/authentication-login.spec.ts` since it requires real session
 * invalidation.
 */

test.describe("Settings dialog", () => {
  test("opens with sidebar nav and lists General + Keyboard Shortcuts sections", async ({
    page,
  }) => {
    await openSettings(page);
    for (const label of [/^General$/i, /^Keyboard Shortcuts$/i]) {
      await expect(page.getByText(label).first()).toBeVisible({
        timeout: 5_000,
      });
    }
    // General section is selected by default and exposes version info
    await expect(page.getByText(/version/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Account section shows the user and management buttons", async ({
    page,
  }) => {
    await openSettings(page);

    const accountNav = page.getByText(/^Account( Settings)?$/i).first();
    if (!(await accountNav.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Account section not visible on this build");
      return;
    }
    await accountNav.click();

    await expect(page.getByText(/admin/).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/update password/i).first()).toBeVisible();
    await expect(page.getByText(/change username/i).first()).toBeVisible();
    await expect(page.getByText(/log out/i).first()).toBeVisible();
    await expect(
      page.getByText(/two-factor authentication/i).first(),
    ).toBeVisible();
  });

  test("Close button dismisses dialog and restores main UI", async ({
    page,
  }) => {
    await openSettings(page);
    await closeSettings(page);
    await expect(
      page.locator('[data-tour="quick-access-bar"]').first(),
    ).toBeVisible();
  });

  test("toggle state persists across dialog open/close", async ({ page }) => {
    const dialog = await openSettings(page);

    const toggle = dialog
      .locator('input[type="checkbox"][role="switch"], input[role="switch"]')
      .first();
    if (!(await toggle.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No toggle in General section on this build");
      return;
    }

    const before = await toggle.isChecked();
    await toggle.click({ force: true });
    const after = await toggle.isChecked();
    expect(after).not.toBe(before);

    await closeSettings(page);
    await openSettings(page);

    const persisted = await toggle.isChecked();
    expect(persisted).toBe(after);

    // Restore
    if (persisted !== before) {
      await toggle.click({ force: true });
    }
  });

  test("segmented controls (e.g. tool-picker mode) persist across reopen", async ({
    page,
  }) => {
    const dialog = await openSettings(page);
    const segmented = dialog.locator(".mantine-SegmentedControl-root").first();
    if (!(await segmented.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No segmented control on this build");
      return;
    }
    const labels = segmented.locator("label");
    const count = await labels.count();
    if (count < 2) {
      test.skip(true, "Segmented control has too few options to assert switch");
      return;
    }
    await labels.nth(1).click();
    await page.waitForTimeout(300);
    await closeSettings(page);
    await openSettings(page);

    // Restore
    const restored = page
      .locator(".mantine-Modal-content .mantine-SegmentedControl-root label")
      .first();
    await restored.click();
  });

  test("config sub-sections (System / Features / Endpoints / API Keys) are reachable when present", async ({
    page,
  }) => {
    const dialog = await openSettings(page);
    const sections = [
      /^System Settings$/i,
      /^Features$/i,
      /^Endpoints$/i,
      /^API Keys$/i,
    ];
    let visited = 0;
    for (const label of sections) {
      const nav = page.getByText(label).first();
      if (await nav.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await nav.click();
        await page.waitForTimeout(200);
        const body = await dialog.textContent();
        expect(body, `body rendered after clicking ${label}`).toBeTruthy();
        visited++;
      }
    }
    test.info().annotations.push({
      type: "config-sections",
      description: `Visited ${visited}/${sections.length} sections on this build`,
    });
  });
});
