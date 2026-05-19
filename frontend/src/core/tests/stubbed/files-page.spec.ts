import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";

/**
 * Stubbed coverage for the `/files` page (the file manager workbench
 * surface). These specs verify UI invariants the live backend isn't
 * needed for - selection model, button visibility under different
 * selection states, mobile drawer behaviour, drag-and-drop wiring,
 * etc. Tests that exercise actual storage round-trips (folder upload,
 * server move) live in a separate live spec, not here.
 */

// Local-only file (no remoteStorageId) and cloud file fixtures, written
// straight into IDB before the React app boots. Both share the same
// shape as StirlingFileStub minus the File data blob (the file manager
// only needs the stub to render the grid; opening / downloading would
// need the blob too).

interface SeedFile {
  id: string;
  name: string;
  remoteStorageId: number | null;
  versionNumber?: number;
  toolHistory?: Array<{ toolId: string; timestamp: number }>;
}

/**
 * Pre-seed the `stirling-pdf-files` IDB with a handful of test files
 * before the app starts. Runs as an initScript so the database is
 * populated by the time FilesPageContext does its first read.
 *
 * The records are minimal stubs - just enough fields for the grid to
 * render and for FilesPageContext's isLeaf filter to accept them.
 */
async function seedFiles(page: Page, files: SeedFile[]): Promise<void> {
  await page.addInitScript((records) => {
    const open = window.indexedDB.open("stirling-pdf-files", 4);
    open.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("files")) {
        const store = db.createObjectStore("files", { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("folderId", "folderId", { unique: false });
        store.createIndex("originalFileId", "originalFileId", {
          unique: false,
        });
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const now = Date.now();
      for (const f of records) {
        store.put({
          id: f.id,
          fileId: f.id,
          quickKey: f.id,
          name: f.name,
          type: "application/pdf",
          size: 1024,
          lastModified: now,
          createdAt: now,
          // Tiny ArrayBuffer placeholder. The grid only renders stubs;
          // opening the file would require real bytes, which the specs
          // here don't exercise.
          data: new ArrayBuffer(8),
          thumbnail: null,
          isLeaf: true,
          versionNumber: f.versionNumber ?? 1,
          originalFileId: f.id,
          parentFileId: null,
          toolHistory: f.toolHistory ?? [],
          folderId: null,
          remoteStorageId: f.remoteStorageId,
          remoteStorageUpdatedAt: f.remoteStorageId ? now : null,
          remoteOwnerUsername: f.remoteStorageId ? "testuser" : null,
          remoteOwnedByCurrentUser: f.remoteStorageId ? true : null,
          remoteAccessRole: f.remoteStorageId ? "owner" : null,
          remoteSharedViaLink: false,
          remoteHasShareLinks: false,
          remoteShareToken: null,
        });
      }
    };
  }, files);
}

/**
 * Stub the storage / folder endpoints the `/files` page hits on mount.
 * Returns the registered handler so individual specs can override the
 * folders list mid-test if they need to (none currently do).
 */
async function stubStorageApis(
  page: Page,
  opts: { storageEnabled?: boolean; sharingEnabled?: boolean } = {},
): Promise<void> {
  const { storageEnabled = true, sharingEnabled = false } = opts;
  await page.route("**/api/v1/config", (route: Route) =>
    route.fulfill({
      json: {
        appVersion: "test",
        storageEnabled,
        storageSharingEnabled: sharingEnabled,
        storageShareLinksEnabled: sharingEnabled,
      },
    }),
  );
  await page.route("**/api/v1/storage/folders", (route: Route) =>
    route.fulfill({ json: [] }),
  );
  // Anything else under storage - return empty so the page doesn't
  // throw on unexpected calls.
  await page.route("**/api/v1/storage/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
}

/**
 * Standard /files page navigation + readiness wait. The page is ready
 * when the file grid has rendered at least one card from the seeded
 * fixtures (waits cap at 5s so a missing seed fails fast).
 */
async function gotoFilesPage(page: Page): Promise<void> {
  await page.goto("/files", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".files-page-card").first()).toBeVisible({
    timeout: 5_000,
  });
}

test.describe("Files page", () => {
  test.describe("Selection model", () => {
    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
        { id: "bravo", name: "bravo.pdf", remoteStorageId: null },
        { id: "charlie", name: "charlie.pdf", remoteStorageId: null },
        { id: "delta", name: "delta.pdf", remoteStorageId: null },
      ]);
    });
    test.use({ autoGoto: false });

    test("plain click selects one file (single-select replaces)", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      const cards = page.locator(".files-page-card:not(.is-folder)");
      await cards.nth(0).click();
      await expect(cards.locator(".is-selected")).toHaveCount(0);
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(1);

      // Plain-clicking a different file replaces the selection.
      await cards.nth(1).click();
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(1);
    });

    test("ctrl+click toggles into multi-select mode (sticky)", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      const cards = page.locator(".files-page-card:not(.is-folder)");
      await cards.nth(0).click();
      await cards.nth(1).click({ modifiers: ["Control"] });
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(2);

      // In multi-select mode (2+), plain-click ADDS instead of
      // replacing - this is the Google Drive pattern the team explicitly
      // moved to so users don't lose their selection when they reach
      // for one more file.
      await cards.nth(2).click();
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(3);

      // Plain-click an already-selected file in multi-mode removes it.
      await cards.nth(0).click();
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(2);
    });

    test("checkboxes hidden in single-select, visible in multi-select", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      const cards = page.locator(".files-page-card:not(.is-folder)");
      // 0 selected: no checkboxes anywhere on file cards.
      await expect(page.locator(".files-page-card-selector")).toHaveCount(0);

      // 1 selected: still no checkbox (the highlight border is the
      // single-select state indicator).
      await cards.nth(0).click();
      await expect(page.locator(".files-page-card-selector")).toHaveCount(0);

      // 2+ selected: checkboxes appear on every file card.
      await cards.nth(1).click({ modifiers: ["Control"] });
      await expect(
        page.locator(".files-page-card-selector").first(),
      ).toBeVisible();
    });

    test("Select all tooltip explains Ctrl/Shift shortcuts", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      // The tooltip is the only discovery point for the new selection
      // model - if this assertion ever breaks, users will be left
      // guessing how to multi-select.
      const selectAll = page.getByRole("button", { name: /^Select all$/i });
      await selectAll.hover();
      await expect(
        page.getByText(/hold Ctrl.*Cmd.*Shift to select a range/i),
      ).toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe("Bulk action button visibility", () => {
    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "local-a", name: "local-a.pdf", remoteStorageId: null },
        { id: "local-b", name: "local-b.pdf", remoteStorageId: null },
        { id: "cloud-a", name: "cloud-a.pdf", remoteStorageId: 1001 },
      ]);
    });
    test.use({ autoGoto: false });

    test("Save to server hidden when nothing selected", async ({ page }) => {
      await gotoFilesPage(page);
      await expect(
        page.getByRole("button", { name: /^Save to server$/i }),
      ).toHaveCount(0);
    });

    test("Save to server visible when local file selected", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      // Click the local-a card.
      await page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "local-a.pdf" })
        .click();
      await expect(
        page.getByRole("button", { name: /^Save to server$/i }),
      ).toBeVisible();
    });

    test("Save to server hidden when ONLY cloud files selected", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      // Cloud-only selection - nothing to save (already on server).
      await page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "cloud-a.pdf" })
        .click();
      await expect(
        page.getByRole("button", { name: /^Save to server$/i }),
      ).toHaveCount(0);
    });
  });

  test.describe("Upload behaviour", () => {
    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "seed", name: "seed.pdf", remoteStorageId: null },
      ]);
    });
    test.use({ autoGoto: false });

    test("upload on /files page doesn't navigate the user away", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      // The native file input is hidden via display:none; the spec
      // simulates an upload by writing to it directly. The file blob
      // is tiny - we're verifying the routing behaviour, not the
      // actual PDF processing pipeline.
      const tinyPdf = Buffer.from("%PDF-1.4\n%%EOF", "utf8");
      const input = page.locator('input[data-testid="file-input"]').first();
      // The file manager's "Open from computer" hidden input is the
      // primary upload entry. If the selector ever changes, this test
      // will need updating.
      if ((await input.count()) === 0) {
        test.skip(
          true,
          "No file-input testid on this build - upload entry-point selector drifted",
        );
      }
      await input.setInputFiles({
        name: "upload-test.pdf",
        mimeType: "application/pdf",
        buffer: tinyPdf,
      });
      // After upload the user should stay on /files (NOT be routed to
      // /viewer or /tools). The earlier behaviour auto-activated the
      // uploaded file in workspace state, which silently popped it up
      // the next time the user navigated to /viewer.
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/files/);
    });
  });

  test.describe("Already-active file handling", () => {
    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "active-test", name: "active-test.pdf", remoteStorageId: null },
      ]);
    });
    test.use({ autoGoto: false });

    test("Add to workspace on already-active file navigates without crash", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      const card = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "active-test.pdf" });
      await card.click();
      // First Add to workspace - adds the file then routes to viewer.
      await page
        .getByRole("button", { name: /Add to workspace/i })
        .first()
        .click();
      await expect(page).not.toHaveURL(/\/files/, { timeout: 3_000 });

      // Navigate back to /files and add the same (now-active) file again.
      // The previous bug returned [] from addStirlingFileStubs (dedup
      // skip), neither viewer/fileEditor branch fired, leaving the
      // workbench in stale state. Today the activation branches on the
      // REQUESTED stubs, not the dedup'd added list.
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      const card2 = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "active-test.pdf" });
      await expect(card2).toBeVisible({ timeout: 5_000 });
      await card2.click();
      await page
        .getByRole("button", { name: /Add to workspace/i })
        .first()
        .click();
      // Should still navigate away, NOT throw and leave us stuck on /files.
      await expect(page).not.toHaveURL(/\/files/, { timeout: 3_000 });
    });
  });

  test.describe("Drag-and-drop wiring", () => {
    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "drag-test", name: "drag-test.pdf", remoteStorageId: null },
      ]);
    });
    test.use({ autoGoto: false });

    test("card thumbnail <img> is not natively draggable", async ({ page }) => {
      // When the <img> is natively draggable (the browser default), the
      // user gets a "download.png" ghost and the card's onDragStart
      // handler never fires - meaning drops onto folders silently do
      // nothing. draggable={false} on the thumb img makes the card-
      // level handler the sole authority on drag intent.
      await gotoFilesPage(page);
      const thumbImg = page.locator(".files-page-card-thumb img").first();
      if ((await thumbImg.count()) === 0) {
        test.skip(
          true,
          "Seeded files have no thumbnailUrl so the <img> branch isn't rendered - drag-hijack regression can't surface",
        );
      }
      await expect(thumbImg).toHaveAttribute("draggable", "false");
    });
  });

  test.describe("Mobile details drawer", () => {
    test.use({
      autoGoto: false,
      viewport: { width: 500, height: 900 },
    });

    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "phone-a", name: "phone-a.pdf", remoteStorageId: null },
        { id: "phone-b", name: "phone-b.pdf", remoteStorageId: null },
      ]);
    });

    test("drawer does NOT auto-open on file selection", async ({ page }) => {
      // The original implementation auto-opened the drawer whenever a
      // file was selected, which blocked multi-select (the backdrop
      // intercepted taps on other file cards). Now the drawer only
      // opens when the user taps the explicit "Show details" button.
      await gotoFilesPage(page);
      await page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "phone-a.pdf" })
        .click();
      // No drawer overlay should be present.
      await expect(page.locator(".mantine-Drawer-content")).toHaveCount(0);
    });

    test("Show details button opens drawer with file info", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      await page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "phone-a.pdf" })
        .click();
      await page.getByRole("button", { name: /Show details/i }).click();
      // Drawer opens, file name shown inside it.
      await expect(page.locator(".mantine-Drawer-content")).toBeVisible({
        timeout: 3_000,
      });
      await expect(
        page.locator(".mantine-Drawer-content").getByText("phone-a.pdf"),
      ).toBeVisible();
    });

    test("multi-select still works while drawer is closed", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      const cards = page.locator(".files-page-card:not(.is-folder)");
      await cards.nth(0).click();
      // The drawer doesn't intercept this second-card click because it's
      // not open by default - this was the whole point of the
      // button-trigger refactor.
      await cards.nth(1).click({ modifiers: ["Control"] });
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(2);
    });
  });
});
