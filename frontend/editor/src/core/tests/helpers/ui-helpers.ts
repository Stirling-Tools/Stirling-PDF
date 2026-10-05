import { expect, type Page, type Locator } from "@playwright/test";

const MANTINE_MODAL_OVERLAY = ".mantine-Modal-overlay";

/** Opens Recents through in-app navigation, preserving the current workspace. */
export async function openRecents(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: /Quick navigation/i })
    .getByRole("button", { name: /^File library$/i })
    .click();
  await page
    .getByRole("navigation", { name: "File sources", exact: true })
    .getByRole("button", { name: "Recents", exact: true })
    .click();
  await expect(page).toHaveURL(/\/files\?view=recent$/);
}

/**
 * Installs file-chooser interception for every browser; specs supply files via setInputFiles().
 * A listener is required even for hidden-input clicks, or Firefox/WebKit open a real OS dialog.
 * Stub and live fixtures install this once per page.
 */
export function suppressNativeFilePicker(page: Page): void {
  page.on("filechooser", () => {});
}

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

/** Uploads through the sidebar and waits for IndexedDB persistence before callers navigate. */
export async function uploadFiles(
  page: Page,
  filePaths: string | string[],
): Promise<void> {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const names = paths.map((p) => p.split(/[\\/]/).pop() ?? p);
  await page.getByTestId("files-button").click();
  await page.locator('[data-testid="file-input"]').setInputFiles(paths);
  await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
    timeout: 10_000,
  });
  await waitForStoredFiles(page, names);
}

/** Polls an existing database without creating or upgrading it, so setup cannot race the app. */
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
    // The IndexedDB write can lag the upload on WebKit under parallel CI load;
    // it lands, just not always within 10s, so give the commit room to finish.
    { timeout: 30_000, polling: 100 },
  );
}

/** Leaves upload-induced viewer mode when present, so tool controls can enable. */
export async function switchToEditorIfViewerMode(page: Page): Promise<void> {
  const goToEditor = page.getByRole("button", {
    name: /go to file editor/i,
  });
  // Auto-navigation may detach this button; the caller's run-button assertion checks readiness.
  if (await goToEditor.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await goToEditor.click({ timeout: 5_000 }).catch(() => {});
  }
}

/** Runs the tool and waits for its output review panel; rejects if either stays unavailable. */
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

/** Opens Settings through the avatar menu and returns its root for scoped queries. */
export async function openSettings(
  page: Page,
  section?: string | RegExp,
): Promise<Locator> {
  await page.locator('[data-testid="config-button"]').first().click();
  await page.getByRole("menuitem", { name: /all settings/i }).click();
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

/** Uses browser Back to leave Settings; section changes replace the current history entry. */
export async function closeSettings(page: Page): Promise<void> {
  const surface = page.locator(SETTINGS_SURFACE);
  // Retry: one back can land on another /settings entry if a spec pushed one.
  await expect(async () => {
    if (await surface.isVisible().catch(() => false)) {
      await page.goBack({ timeout: 2_000 }).catch(() => {});
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
