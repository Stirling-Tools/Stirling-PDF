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
 * action. The native picker is mocked globally by `suppressNativeFilePicker`,
 * so the click is safe on every browser; files are set on the hidden input via
 * `setInputFiles`. Returns only once the files are durably in IndexedDB, so
 * callers may navigate or reload without racing the write.
 */
export async function uploadFiles(
  page: Page,
  filePaths: string | string[],
): Promise<void> {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const names = paths.map((p) => p.split(/[\\/]/).pop() ?? p);
  await page.getByTestId("files-button").click();
  await page.locator('[data-testid="file-input"]').setInputFiles(paths);
  // The sidebar renders from in-memory state, before the IDB write commits.
  // first() so multi-file uploads pass too.
  await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
    timeout: 10_000,
  });
  // A navigation before the write commits aborts the transaction and drops the
  // file, so wait for it to land rather than assume the sidebar means it did.
  await waitForStoredFiles(page, names);
}

/**
 * Resolve once every uploaded name is in the files store. Read-only: aborts
 * rather than create or upgrade the DB, so it can't race the app's own
 * versioned open and leave it without object stores. Reads only a DB the app
 * already made; until then each poll returns false and retries.
 */
async function waitForStoredFiles(page: Page, names: string[]): Promise<void> {
  await page.waitForFunction(
    (expected) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("stirling-pdf-files");
        open.onupgradeneeded = () => {
          open.transaction?.abort();
          resolve(false);
        };
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("files")) {
            db.close();
            resolve(false);
            return;
          }
          const request = db
            .transaction("files", "readonly")
            .objectStore("files")
            .getAll();
          request.onsuccess = () => {
            const stored = new Set(
              (request.result as Array<{ name?: string }>).map((r) => r.name),
            );
            db.close();
            resolve(expected.every((name) => stored.has(name)));
          };
          request.onerror = () => {
            db.close();
            resolve(false);
          };
        };
        open.onerror = () => resolve(false);
        open.onblocked = () => resolve(false);
      }),
    names,
    { timeout: 10_000, polling: 100 },
  );
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

/** The settings page's root. Settings is a route, not a dialog. */
export const SETTINGS_SURFACE = ".settings-page";

/**
 * Go to the global Settings page, which opens on its first section. Pass
 * `section` to land on a named one instead. Returns the page's root locator so
 * callers can scope further queries to it.
 */
export async function openSettings(
  page: Page,
  section?: string | RegExp,
): Promise<Locator> {
  await page.locator('[data-testid="settings-button"]').first().click();
  const surface = page.locator(SETTINGS_SURFACE);
  await expect(surface).toBeVisible({ timeout: 5_000 });
  if (section) {
    await surface
      .locator(".modal-nav-item")
      .filter({ hasText: section })
      .first()
      .click();
    // The URL flips before React commits the section, so wait on the page
    // title rather than on the address bar.
    await expect(surface.locator(".settings-page__title")).toHaveText(section, {
      timeout: 5_000,
    });
  }
  return surface;
}

/**
 * Leave Settings by the page's own Back control, which restores the originating
 * URL, and assert the page is gone before returning.
 */
export async function closeSettings(page: Page): Promise<void> {
  const surface = page.locator(SETTINGS_SURFACE);
  const back = page.locator('[data-testid="settings-back"]').first();
  // Assert the exit exists before the retry loop, or a control that is missing
  // in this build reads as an opaque timeout below instead of a named failure.
  await expect(back).toBeVisible({ timeout: 5_000 });
  // A click can be swallowed by a re-render, leaving the page up; retry until
  // it is gone. A genuinely broken exit still fails - every retry misses and
  // the page stays past the cap.
  await expect(async () => {
    if (await surface.isVisible().catch(() => false)) {
      await back.click({ timeout: 2_000 }).catch(() => {});
    }
    await expect(surface).not.toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 12_000 });
}

/** Unfold every sidebar group, for checks that scan the whole section list. */
export async function expandSettingsGroups(page: Page): Promise<void> {
  // Wait for the aside to render its groups first; evaluateAll on an empty set
  // is a silent no-op that surfaces later as an unrelated missing-item failure.
  await expect(
    page.locator(`${SETTINGS_SURFACE} .settings-page__group`).first(),
  ).toBeAttached({ timeout: 5_000 });
  await page
    .locator(`${SETTINGS_SURFACE} .settings-page__group[aria-expanded="false"]`)
    .evaluateAll((buttons) =>
      buttons.forEach((b) => (b as HTMLButtonElement).click()),
    );
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
