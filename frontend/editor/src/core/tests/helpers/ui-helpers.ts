import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Shared UI helpers for Playwright specs.
 *
 * Centralises the patterns repeated across the suite (file upload, settings
 * dialog, run-button + review-panel wait, viewer-mode escape, modal-overlay
 * waits) so each spec stays focused on its assertion rather than the
 * machinery.
 */

const MANTINE_MODAL_OVERLAY = ".mantine-Modal-overlay";

/**
 * Wait for a Mantine Modal overlay to appear or disappear. Most file pickers,
 * settings dialogs, encrypted-PDF unlock prompts and so on render through
 * this overlay; specs use it as a synchronisation point.
 */
export async function waitForModalOpen(
  page: Page,
  timeout = 5_000,
): Promise<void> {
  await page.waitForSelector(MANTINE_MODAL_OVERLAY, {
    state: "visible",
    timeout,
  });
}

export async function waitForModalClose(
  page: Page,
  timeout = 10_000,
): Promise<void> {
  await page.waitForSelector(MANTINE_MODAL_OVERLAY, {
    state: "hidden",
    timeout,
  });
}

/**
 * Upload one or more files by setting them directly on the FileSidebar's
 * hidden `data-testid="file-input"`, which is always rendered (collapsed or
 * expanded sidebar) and feeds the global workspace.
 *
 * We deliberately do NOT click the "Open from computer" (`files-button`)
 * entry point first. That handler calls `input.click()`, which opens a real
 * native OS file picker. Playwright suppresses that dialog on chromium but
 * NOT on firefox/webkit, where the native picker leaks onto the host, hangs
 * the run, and fails the nightly cross-browser suite. `setInputFiles` sets
 * the files and dispatches `change` on its own, so the button click is
 * unnecessary and must be avoided for cross-browser parity.
 *
 * `setInputFiles` doesn't await the input's async onChange (which writes to
 * IndexedDB via `addFiles`), so without a sync point a caller that follows
 * with `page.goto()` can race the IDB flush. Wait for the workbench to
 * pick up the upload (the FileSidebar renders the added file in its scroll
 * list once `addFiles` resolves and IDB has been written).
 */
export async function uploadFiles(
  page: Page,
  filePaths: string | string[],
): Promise<void> {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  await page.locator('[data-testid="file-input"]').setInputFiles(paths);
  // Sync point: wait until at least one file lands in the sidebar's file
  // list. The list only renders once `addFiles` has resolved (which awaits
  // the IDB write). Use first() so multi-file uploads pass too.
  await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Some tools (Merge in particular) park the workbench in `viewer` mode after
 * upload, which keeps the run button disabled. The UI exposes a "Go to file
 * editor" affordance to switch out of viewer mode; this helper clicks it
 * when present and is a no-op otherwise.
 */
export async function switchToEditorIfViewerMode(page: Page): Promise<void> {
  const goToEditor = page.getByRole("button", {
    name: /go to file editor/i,
  });
  // The affordance only exists while the workbench is transiently in viewer
  // mode after an upload. The app can auto-leave viewer mode and detach the
  // button between our visibility check and the click - the transition timing
  // differs on firefox/webkit, where the detached button hangs a plain
  // `click()` for the full actionability timeout. Treat a vanished button as
  // "already in editor mode": swallow the click failure and let the caller's
  // run-button assertion catch any genuine regression.
  if (await goToEditor.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await goToEditor.click({ timeout: 5_000 }).catch(() => {});
  }
}

/**
 * Click the tool's run button and wait for the review panel to render with
 * the produced output. Throws if the run button never enables or the review
 * panel never appears, both of which are real regressions.
 */
export async function runToolAndWaitForReview(
  page: Page,
  opts: { runTimeout?: number; reviewTimeout?: number } = {},
): Promise<void> {
  const { runTimeout = 15_000, reviewTimeout = 60_000 } = opts;
  const runBtn = page.locator('[data-tour="run-button"]');
  await expect(runBtn).toBeEnabled({ timeout: runTimeout });
  await runBtn.click();
  await expect(
    page.locator('[data-testid="review-panel-container"]'),
  ).toBeVisible({ timeout: reviewTimeout });
}

/**
 * Open the global Settings dialog. Returns the dialog locator so callers can
 * scope further queries to it.
 */
export async function openSettings(page: Page): Promise<Locator> {
  await page.locator('[data-testid="config-button"]').first().click();
  const dialog = page.locator(".mantine-Modal-content").first();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  return dialog;
}

/**
 * Close the Settings dialog via its built-in Close button and assert the
 * dialog is fully dismissed before returning.
 */
export async function closeSettings(page: Page): Promise<void> {
  const closeBtn = page.locator('[aria-label="Close"]').first();
  await closeBtn.click();
  await expect(page.locator(".mantine-Modal-content").first()).not.toBeVisible({
    timeout: 5_000,
  });
}

/**
 * Dismiss the onboarding tour tooltip (`Watch walkthroughs here…`) when it's
 * blocking pointer events on firefox/webkit. No-op when absent.
 */
export async function dismissTourTooltip(page: Page): Promise<void> {
  const closeBtn = page.getByRole("button", { name: /close tooltip/i }).first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click();
  }
}
