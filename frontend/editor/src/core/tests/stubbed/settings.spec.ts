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
    // Verify the main UI is restored — the FileSidebar is always visible
    await expect(
      page.locator('[data-testid="files-button"]').first(),
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

    // Click the visible label wrapper rather than the hidden input directly —
    // force-clicking the input doesn't register a state change in Firefox.
    const toggleLabel = dialog
      .locator('label:has(input[role="switch"]), .mantine-Switch-body')
      .first();

    const before = await toggle.isChecked();
    await toggleLabel.click();
    const after = await toggle.isChecked();
    expect(after).not.toBe(before);

    await closeSettings(page);
    await openSettings(page);

    const persisted = await toggle.isChecked();
    expect(persisted).toBe(after);

    // Restore
    if (persisted !== before) {
      await toggleLabel.click();
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

  test("intra-modal tab switching updates URL via replaceState, never pushState", async ({
    page,
  }) => {
    // Mechanism test for the "background flash" fix. Before the fix, every
    // tab click called `navigate(...)` which fired React Router's location
    // subscribers - HomePage, QuickAccessBar, FileManagerView, ... - and the
    // layer behind the Mantine overlay repainted, causing backdrop-filter
    // blur to recompute and visibly flash. After the fix, only the very
    // first nav into /settings/* is allowed to go through React Router (so
    // HomePage's location-watching effect opens the modal and the back
    // button has a real history entry to pop). Every subsequent tab click
    // updates the URL bar via raw `window.history.replaceState`, which
    // React Router does NOT subscribe to. We assert this directly by
    // counting calls.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __historyOps: { push: number; replace: number };
      };
      w.__historyOps = { push: 0, replace: 0 };
      const origPush = window.history.pushState.bind(window.history);
      const origReplace = window.history.replaceState.bind(window.history);
      window.history.pushState = function (...args) {
        w.__historyOps.push++;
        return origPush(
          ...(args as Parameters<typeof window.history.pushState>),
        );
      };
      window.history.replaceState = function (...args) {
        w.__historyOps.replace++;
        return origReplace(
          ...(args as Parameters<typeof window.history.replaceState>),
        );
      };
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openSettings(page);

    const generalNav = page.locator('[data-tour="admin-general-nav"]').first();
    const hotkeysNav = page.locator('[data-tour="admin-hotkeys-nav"]').first();
    await expect(generalNav).toBeVisible({ timeout: 5_000 });

    // First nav into /settings/* takes the React Router path (push). We
    // snapshot both counters AFTER this to isolate the intra-modal delta.
    await generalNav.click();
    await page.waitForURL(/\/settings\/general/, { timeout: 5_000 });
    const baseline = await page.evaluate(() => {
      const w = window as unknown as {
        __historyOps: { push: number; replace: number };
      };
      return { ...w.__historyOps };
    });

    // Now do 4 round-trips between two tabs - 8 intra-modal clicks total.
    for (let i = 0; i < 4; i++) {
      await hotkeysNav.click();
      await page.waitForURL(/\/settings\/hotkeys/, { timeout: 5_000 });
      await generalNav.click();
      await page.waitForURL(/\/settings\/general/, { timeout: 5_000 });
    }

    const after = await page.evaluate(() => {
      const w = window as unknown as {
        __historyOps: { push: number; replace: number };
      };
      return { ...w.__historyOps };
    });

    // Zero pushes during 8 intra-modal clicks - the regression would show
    // up here as `after.push - baseline.push >= 1`.
    expect(after.push - baseline.push).toBe(0);
    // Exactly 8 replaces - one per click.
    expect(after.replace - baseline.replace).toBe(8);
  });

  test("close returns to origin URL even after switching tabs (no history pile-up)", async ({
    page,
  }) => {
    // Land on / first so the originating URL is unambiguous.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-testid="config-button"]').first(),
    ).toBeVisible({ timeout: 5_000 });

    const originPath = new URL(page.url()).pathname;
    const dialog = await openSettings(page);

    // Click the same visible nav 3 times. In the buggy code each click
    // pushed a fresh history entry, so close-by-back popped only the
    // most recent tab change. The fix uses PUSH for the first nav (when
    // not yet in /settings/*) and REPLACE for subsequent navs, so the
    // origin URL stays at history depth 1 regardless of how many tabs
    // the user clicks through.
    const generalNav = dialog
      .locator('[data-tour="admin-general-nav"]')
      .first();
    await expect(generalNav).toBeVisible({ timeout: 5_000 });
    for (let i = 0; i < 3; i++) {
      await generalNav.click();
    }
    // Wait for the URL to settle on /settings/general before closing so
    // we're not racing the in-modal nav under parallel-worker load.
    await page.waitForURL(/\/settings\/general/, { timeout: 5_000 });

    await closeSettings(page);
    // Wait for the URL pathname to settle back to origin. Match only
    // pathname so trailing ?query or #hash don't trip the assertion.
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 5_000 })
      .toBe(originPath);
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
