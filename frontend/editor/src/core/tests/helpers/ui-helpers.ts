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
 * Suppress the native OS file picker for the whole page, on every browser.
 *
 * Several upload entry points (the FileSidebar "Open from computer" button,
 * the Mantine `<FileInput>`, AddFileCard, etc.) open a file dialog by clicking
 * a hidden `<input type="file">`. On firefox/webkit Playwright only intercepts
 * that dialog while the page has a `filechooser` listener - it toggles
 * `Page.setInterceptFileChooserDialog` off the event subscription. With no
 * listener the real OS picker leaks onto the host and hangs the nightly run.
 *
 * Registering a (no-op) `filechooser` listener flips that interception on for
 * every browser, so the dialog is suppressed at the browser level however it
 * was triggered - a programmatic `.click()`, a `<label>` activation, or
 * Playwright's own click. We deliberately don't set files in the handler: specs
 * still drive uploads explicitly via `setInputFiles()`, which sets files
 * through the protocol regardless of the pending intercepted chooser. This lets
 * a spec click the real entry-point button while the picker stays mocked
 * cross-browser - unlike a global `HTMLInputElement.prototype.click` override,
 * which misses `<label>`-triggered pickers and never enables Playwright's own
 * interception.
 *
 * Installed once per page by the shared test fixtures (stub + live), so no spec
 * has to opt in.
 */
export function suppressNativeFilePicker(page: Page): void {
  page.on("filechooser", () => {
    // Interception alone suppresses the native dialog; specs provide the files
    // themselves via setInputFiles() on the hidden input.
  });
}

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
 * Upload one or more files through the FileSidebar's "Open from computer"
 * action. The button is always rendered (collapsed or expanded sidebar) and
 * fires the hidden `data-testid="file-input"`. Its native OS picker is mocked
 * globally by `suppressNativeFilePicker` (installed by the test fixtures), so
 * the click is safe on every browser; we then set the files directly on the
 * input via `setInputFiles`.
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
  await page.getByTestId("files-button").click();
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
