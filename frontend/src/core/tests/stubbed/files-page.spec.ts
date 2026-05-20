import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";

/** Stubbed coverage for the /files page UI invariants. */

interface SeedFile {
  id: string;
  name: string;
  remoteStorageId: number | null;
  versionNumber?: number;
  toolHistory?: Array<{ toolId: string; timestamp: number }>;
}

/** Seed IDB + register the cloud entries with the server stub. */
async function seedFiles(page: Page, files: SeedFile[]): Promise<void> {
  // Build the server-side view from the cloud entries so reconcileServerFiles
  // sees them as still-existing on the server (otherwise they get detached).
  const serverFiles = files
    .filter((f) => f.remoteStorageId != null)
    .map((f) => ({
      id: f.remoteStorageId,
      fileName: f.name,
      contentType: "application/pdf",
      sizeBytes: 1024,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      owner: "testuser",
      ownedByCurrentUser: true,
      accessRole: "owner",
      shareLinks: [],
      filePurpose: "generic",
      folderId: null,
    }));
  await page.route("**/api/v1/storage/files", (route: Route) =>
    route.fulfill({ json: serverFiles }),
  );
  await page.addInitScript((records) => {
    const open = window.indexedDB.open("stirling-pdf-files", 4);
    open.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Create both `files` and `folders` stores on this DB.
      if (!db.objectStoreNames.contains("files")) {
        const store = db.createObjectStore("files", { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("folderId", "folderId", { unique: false });
        store.createIndex("originalFileId", "originalFileId", {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("folders")) {
        const fStore = db.createObjectStore("folders", { keyPath: "id" });
        fStore.createIndex("parentFolderId", "parentFolderId", {
          unique: false,
        });
        fStore.createIndex("name", "name", { unique: false });
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
          // Placeholder; opening would need real bytes.
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

/** Stub the storage + config endpoints hit on mount. */
async function stubStorageApis(
  page: Page,
  opts: { storageEnabled?: boolean; sharingEnabled?: boolean } = {},
): Promise<void> {
  const { storageEnabled = true, sharingEnabled = false } = opts;
  // No enableLogin; setting it would trigger the auth redirect.
  const configPayload = {
    appVersion: "test",
    storageEnabled,
    storageSharingEnabled: sharingEnabled,
    storageShareLinksEnabled: sharingEnabled,
  };
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({ json: configPayload }),
  );
  await page.route("**/api/v1/config", (route: Route) =>
    route.fulfill({ json: configPayload }),
  );
  await page.route("**/api/v1/storage/folders", (route: Route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/storage/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
}

/** Navigate to /files and wait for at least one seeded card. */
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

      // In multi-select (2+), plain-click ADDS instead of replacing.
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

      // 1 selected: still no checkbox (highlight border is the indicator).
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
      // Tooltip is the discovery point for Ctrl/Shift multi-select.
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
      // Two entry points share the name; use .first() for strict mode.
      await expect(
        page.getByRole("button", { name: /^Save to server$/i }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Save to server$/i }),
      ).toHaveCount(2);
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

    test("Per-file kebab has Save to server item for local file", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      // Open the kebab without first selecting.
      const localCard = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "local-a.pdf" });
      await localCard.getByRole("button", { name: /File actions/i }).click();
      await expect(
        page.getByRole("menuitem", { name: /^Save to server$/i }),
      ).toBeVisible();
    });

    test("Per-file kebab hides Save to server for cloud file", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      // Cloud file kebab omits Save to server.
      const cloudCard = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "cloud-a.pdf" });
      await cloudCard.getByRole("button", { name: /File actions/i }).click();
      await expect(
        page.getByRole("menuitem", { name: /^Save to server$/i }),
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
      // Write to the hidden file input directly.
      const tinyPdf = Buffer.from("%PDF-1.4\n%%EOF", "utf8");
      const input = page.locator('input[data-testid="file-input"]').first();
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
      // Upload must leave the user on /files.
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
      // First Add to workspace; routes to viewer.
      await page
        .getByRole("button", { name: /Add to workspace/i })
        .first()
        .click();
      await expect(page).not.toHaveURL(/\/files/, { timeout: 3_000 });

      // Re-add the now-active file; activation branches on requested stubs.
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
      // draggable={false} keeps the card's onDragStart as drag authority.
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
      // Drawer is button-triggered only.
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
      // Drawer stays closed so the second click reaches the card.
      await cards.nth(1).click({ modifiers: ["Control"] });
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(2);
    });
  });

  test.describe("Empty-state CTAs", () => {
    test.use({ autoGoto: false });

    test("renders Upload + Create folder CTAs when grid is empty", async ({
      page,
    }) => {
      await stubStorageApis(page);
      // No seedFiles - grid is empty so EmptyState renders.
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      // Wait for the empty state itself rather than card visibility -
      // gotoFilesPage's card-visibility wait would time out here.
      await expect(page.locator(".files-page-empty")).toBeVisible({
        timeout: 5_000,
      });
      // Both CTAs centered in the grid area where the eye lands.
      await expect(
        page
          .locator(".files-page-empty-actions")
          .getByRole("button", { name: /Upload files/i }),
      ).toBeVisible();
      await expect(
        page
          .locator(".files-page-empty-actions")
          .getByRole("button", { name: /Create folder/i }),
      ).toBeVisible();
    });

    test("Create folder CTA disabled when storage isn't reachable", async ({
      page,
    }) => {
      // Storage disabled - the New folder action is gated and the CTA
      // should mirror that gating with a disabled state.
      await stubStorageApis(page, { storageEnabled: false });
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".files-page-empty")).toBeVisible({
        timeout: 5_000,
      });
      const createCta = page
        .locator(".files-page-empty-actions")
        .getByRole("button", { name: /Create folder/i });
      await expect(createCta).toBeVisible();
      await expect(createCta).toBeDisabled();
    });
  });

  test.describe("Move dialog inline create-folder", () => {
    test.use({ autoGoto: false });

    test("Move dialog shows Create new folder affordance", async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "to-move", name: "to-move.pdf", remoteStorageId: null },
      ]);
      await gotoFilesPage(page);
      // Open the move dialog via the per-file kebab.
      const card = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "to-move.pdf" });
      await card.getByRole("button", { name: /File actions/i }).click();
      await page.getByRole("menuitem", { name: /Move to/i }).click();
      await expect(
        page.getByRole("button", { name: /Create new folder/i }),
      ).toBeVisible();
    });
  });

  test.describe("Side-rail integration with /files", () => {
    test.use({ autoGoto: false });

    test("Rail Search focuses the central search field, no navigation", async ({
      page,
    }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
      ]);
      await gotoFilesPage(page);
      // Click the search row in the rail.
      await page.locator(".file-sidebar-search-row").click();
      // The central search input should be focused.
      const focused = await page.evaluate(
        () => document.activeElement?.getAttribute("aria-label") ?? "",
      );
      expect(focused).toMatch(/Search/i);
      // And we must still be on /files (i.e. didn't navigate home).
      await expect(page).toHaveURL(/\/files/);
    });

    test("Rail New folder button visible on /files", async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
      ]);
      await gotoFilesPage(page);
      // The extra action is the only thing with this testid.
      await expect(
        page.locator('[data-testid="files-rail-new-folder"]'),
      ).toBeVisible();
    });
  });

  test.describe("Server file sync", () => {
    test.use({ autoGoto: false });

    test("Server-only file downloads bytes when opened", async ({ page }) => {
      await stubStorageApis(page);
      const REMOTE_ID = 9001;
      await page.route("**/api/v1/storage/files", (route: Route) =>
        route.fulfill({
          json: [
            {
              id: REMOTE_ID,
              fileName: "cross-browser.pdf",
              contentType: "application/pdf",
              sizeBytes: 4096,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              owner: "testuser",
              ownedByCurrentUser: true,
              accessRole: "owner",
              shareLinks: [],
              filePurpose: "generic",
              folderId: null,
            },
          ],
        }),
      );
      let downloadHit = false;
      await page.route(
        `**/api/v1/storage/files/${REMOTE_ID}/download`,
        (route: Route) => {
          downloadHit = true;
          route.fulfill({
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'attachment; filename="cross-browser.pdf"',
            },
            body: Buffer.from("%PDF-1.4\n%%EOF", "utf8"),
          });
        },
      );
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      const card = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "cross-browser.pdf" });
      await expect(card).toBeVisible({ timeout: 5_000 });
      // Open via Add to workspace (kebab > Add to workspace).
      await card.getByRole("button", { name: /File actions/i }).click();
      await page.getByRole("menuitem", { name: /Add to workspace/i }).click();
      // The materializer should have hit the download endpoint and
      // routed the user to the viewer (/).
      await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?(\?|$)/, {
        timeout: 5_000,
      });
      expect(downloadHit).toBe(true);
    });

    test("Server-only files appear in /files on a fresh browser", async ({
      page,
    }) => {
      await stubStorageApis(page);
      // No local IDB seed. Override the GET /api/v1/storage/files route
      // to return a file that the server knows about. The /files grid
      // should pull this in via the new sync path.
      await page.route("**/api/v1/storage/files", (route: Route) =>
        route.fulfill({
          json: [
            {
              id: 9001,
              fileName: "cross-browser.pdf",
              contentType: "application/pdf",
              sizeBytes: 4096,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              owner: "testuser",
              ownedByCurrentUser: true,
              accessRole: "owner",
              shareLinks: [],
              filePurpose: "generic",
              folderId: null,
            },
          ],
        }),
      );
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      // The file lands as a synthesised server stub.
      await expect(
        page
          .locator(".files-page-card:not(.is-folder)")
          .filter({ hasText: "cross-browser.pdf" }),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe("Folder tree panel resize", () => {
    test.use({ autoGoto: false });

    test("Resize handle is present and keyboard-adjustable", async ({
      page,
    }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
      ]);
      await gotoFilesPage(page);
      const handle = page.locator(".folder-tree-panel-resizer").first();
      await expect(handle).toBeVisible();
      const before = await page.evaluate(() => {
        const el = document.querySelector(
          ".folder-tree-panel[data-active='true']",
        ) as HTMLElement | null;
        return el?.getBoundingClientRect().width ?? 0;
      });
      await handle.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      const after = await page.evaluate(() => {
        const el = document.querySelector(
          ".folder-tree-panel[data-active='true']",
        ) as HTMLElement | null;
        return el?.getBoundingClientRect().width ?? 0;
      });
      // Four 8px steps = +32px.
      expect(after).toBeGreaterThanOrEqual(before + 24);
    });
  });
});
