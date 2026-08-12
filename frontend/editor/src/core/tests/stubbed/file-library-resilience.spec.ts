/** The sidebar and file pickers must reach a resting state even when storage
 *  can't be read. Blocks the database for real, then asserts the UI recovers. */

import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

/** The app opens `stirling-pdf-files` at this version; block it from below. */
const BLOCKING_VERSION = 8;

/** Park a connection on an older version and never yield it, the way a tab
 *  running an older build does, so the app's upgrade can't proceed. */
async function blockTheFilesDatabase(page: import("@playwright/test").Page) {
  await page.addInitScript((version: number) => {
    const request = indexedDB.open("stirling-pdf-files", version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      // Deliberately NO onversionchange handler: hold the database open.
      (window as unknown as { __blocker?: IDBDatabase }).__blocker =
        request.result;
    };
  }, BLOCKING_VERSION);
}

/** Closing the context is NOT enough: WebKit keeps origin databases between
 *  contexts, so a stray v8 makes a random later spec fail. */
async function unblockTheFilesDatabase(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const holder = window as unknown as { __blocker?: IDBDatabase };
    holder.__blocker?.close();
    holder.__blocker = undefined;
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("stirling-pdf-files");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
}

test.use({ autoGoto: false });

test("the sidebar stops loading even when the file library is unreadable", async ({
  page,
}) => {
  // Allow for the manager's blocked-upgrade grace period plus app boot.
  test.setTimeout(120_000);

  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      warnings.push(message.text());
    }
  });

  await blockTheFilesDatabase(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  try {
    // Storage is not on the critical path for rendering the workbench.
    await page.waitForSelector('[data-tour="tool-button-compare"]', {
      timeout: 60_000,
    });

    // The spinner is the whole bug: it must clear once the manager gives up.
    await expect(page.locator(".file-sidebar-loading")).toHaveCount(0, {
      timeout: 60_000,
    });

    // The reason must be discoverable - a silent console made the original
    // report impossible to diagnose.
    expect(
      warnings.some((text) => /blocked by another open connection/i.test(text)),
      `expected a blocked-database warning, got: ${JSON.stringify(warnings)}`,
    ).toBe(true);
  } finally {
    await unblockTheFilesDatabase(page);
  }
});

// `loadRecentFiles` only fetches `/api/v1/storage/files` when app-config
// advertises `storageEnabled`; without it the route below is never requested.
test.describe("with server-side storage enabled", () => {
  test.use({ stubOptions: { storageEnabled: true } });

  test("the picker's Workbench tab lists files while saved files are still loading", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Hold the saved-files read open so the picker stays stuck all test.
    let sawSavedFilesRequest = false;
    await page.route("**/api/v1/storage/files", async () => {
      sawSavedFilesRequest = true;
      await new Promise(() => {
        /* never responds */
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tour="tool-button-compare"]', {
      timeout: 60_000,
    });

    // Put a file in the workbench so the Workbench tab has something to show.
    await page.getByTestId("files-button").click();
    await page.locator('[data-testid="file-input"]').setInputFiles(SAMPLE_PDF);
    await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.locator('[data-tour="tool-button-compare"]').first().click();
    await page.getByTestId("compare-slot-base-add").click();

    // The picker must actually be stuck, or the rest proves nothing.
    const picker = page.locator(".mantine-Popover-dropdown");
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => sawSavedFilesRequest, { timeout: 30_000 })
      .toBe(true);

    // Workbench lists from memory, so a stuck read must not hide it. Scope to
    // the popover: the sidebar row behind it matches the same locator.
    await picker
      .getByRole("button", { name: "Workbench", exact: true })
      .click();
    await expect(
      picker.getByRole("button", { name: /sample\.pdf/ }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
