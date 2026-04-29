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
 * Upload one or more files through the workbench's "Files" modal. The modal
 * auto-closes once a file is selected; we wait for the overlay to vanish so
 * the caller can interact with the page immediately afterwards.
 *
 * Pass `awaitClose: false` when the spec is testing a flow that keeps the
 * modal open after upload (e.g. encrypted-PDF unlock — the unlock modal
 * appears on top before the files modal closes).
 */
export async function uploadFiles(
  page: Page,
  filePaths: string | string[],
  opts: { awaitClose?: boolean } = {},
): Promise<void> {
  const { awaitClose = true } = opts;
  await page.getByTestId("files-button").click();
  await waitForModalOpen(page);
  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(filePaths as string | string[]);
  if (awaitClose) {
    await waitForModalClose(page);
  }
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
  if (await goToEditor.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await goToEditor.click();
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
