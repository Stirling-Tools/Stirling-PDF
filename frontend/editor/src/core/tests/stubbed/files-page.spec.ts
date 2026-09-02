import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import { DATABASE_CONFIGS } from "@app/services/indexedDBManager";

/** Stubbed coverage for the /files page UI invariants. */

interface SeedFile {
  id: string;
  name: string;
  remoteStorageId: number | null;
  folderId?: string;
  versionNumber?: number;
  toolHistory?: Array<{ toolId: string; timestamp: number }>;
}

/** Seed IDB + register the cloud entries with the server stub. */
interface SeedFolder {
  id: string;
  name: string;
}

async function seedFiles(
  page: Page,
  files: SeedFile[],
  // Browser-owned folders, seeded in the same open: a server folder needs an
  // authenticated sync the stubbed app never runs.
  virtualFolders: SeedFolder[] = [],
): Promise<void> {
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
  await page.addInitScript(
    ({ records, vFolders, dbVersion }) => {
      const open = window.indexedDB.open("stirling-pdf-files", dbVersion);
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
        if (!db.objectStoreNames.contains("virtual_folders")) {
          const vStore = db.createObjectStore("virtual_folders", {
            keyPath: "id",
          });
          vStore.createIndex("parentFolderId", "parentFolderId", {
            unique: false,
          });
        }
        if (!db.objectStoreNames.contains("local_folders")) {
          db.createObjectStore("local_folders", { keyPath: "id" });
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        // Yield the connection if the app ever needs to upgrade, and drop it
        // once the writes commit, so the seed never blocks the app's open.
        db.onversionchange = () => db.close();
        const tx = db.transaction(["files", "virtual_folders"], "readwrite");
        const store = tx.objectStore("files");
        const now = Date.now();
        for (const folder of vFolders) {
          tx.objectStore("virtual_folders").put({
            id: folder.id,
            kind: "virtual",
            name: folder.name,
            parentFolderId: null,
            createdAt: now,
            updatedAt: now,
          });
        }
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
            folderId: f.folderId ?? null,
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
        tx.oncomplete = () => db.close();
      };
    },
    {
      records: files,
      vFolders: virtualFolders,
      dbVersion: DATABASE_CONFIGS.FILES.version,
    },
  );
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

/** Navigate to /files and wait for at least one real (non-skeleton) card.
 *  `.files-page-card` also matches the loading-state skeleton placeholders, and
 *  their parent grid carries `aria-busy="true"` which intercepts pointer events
 *  -- so waiting for any `.files-page-card` races the skeleton→real transition
 *  and causes flaky timeouts on slower CI runners. */
async function gotoFilesPage(page: Page): Promise<void> {
  await page.goto("/files", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
  ).toBeVisible({ timeout: 10_000 });
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
      await cards.nth(1).click({ modifiers: ["ControlOrMeta"] });
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
      await cards.nth(1).click({ modifiers: ["ControlOrMeta"] });
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

  test.describe("Save to server gating (storage disabled)", () => {
    test.beforeEach(async ({ page }) => {
      // storageEnabled:false -> Save-to-server stays visible for local-only
      // files but is disabled (with an explanatory tooltip), not hidden, so
      // users discover the feature and know to ask their admin.
      await stubStorageApis(page, { storageEnabled: false });
      await seedFiles(page, [
        { id: "local-a", name: "local-a.pdf", remoteStorageId: null },
      ]);
    });
    test.use({ autoGoto: false });

    test("bulk Save to server is disabled (not hidden) when storage off", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      await page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "local-a.pdf" })
        .click();
      const saveButtons = page.getByRole("button", {
        name: /^Save to server$/i,
      });
      // Present (toolbar + details panel) and every instance disabled.
      const count = await saveButtons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        await expect(saveButtons.nth(i)).toBeVisible();
        await expect(saveButtons.nth(i)).toBeDisabled();
      }
    });

    test("per-file kebab Save to server is disabled (not hidden) when storage off", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      const localCard = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "local-a.pdf" });
      await localCard.getByRole("button", { name: /File actions/i }).click();
      const item = page.getByRole("menuitem", { name: /^Save to server$/i });
      await expect(item).toBeVisible();
      await expect(item).toBeDisabled();
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

  test.describe("Opening a file already in the workspace", () => {
    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "dupe-test", name: "dupe-test.pdf", remoteStorageId: null },
      ]);
    });
    test.use({ autoGoto: false });

    /**
     * Opening a file that is already open has nothing to fetch and nothing to add:
     * sending it through materialize-and-add again has no reason to succeed twice.
     */
    test("opens it once, and opening it again neither duplicates nor throws", async ({
      page,
    }) => {
      await gotoFilesPage(page);
      const card = () =>
        page
          .locator(".files-page-card:not(.is-folder)")
          .filter({ hasText: "dupe-test.pdf" });

      await card().dblclick();
      await expect(page).not.toHaveURL(/\/files/, { timeout: 5_000 });
      await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1, {
        timeout: 10_000,
      });

      // Back to the library and open the same file again.
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      await expect(card()).toBeVisible({ timeout: 10_000 });
      await card().dblclick();
      await expect(page).not.toHaveURL(/\/files/, { timeout: 5_000 });

      // Still one: the workspace holds the file once, and the app is still up.
      await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1, {
        timeout: 10_000,
      });
      await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
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
      // On a phone a selection swaps the toolbar for a contextual bar, so the
      // bulk actions - Show details among them - live behind one trigger.
      await page.locator(".files-page-toolbar-bulk-trigger").click();
      await page.getByRole("menuitem", { name: /Show details/i }).click();
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
      await cards.nth(1).click({ modifiers: ["ControlOrMeta"] });
      await expect(page.locator(".files-page-card.is-selected")).toHaveCount(2);
    });
  });

  test.describe("Empty-state CTAs", () => {
    test.use({ autoGoto: false });

    test("renders Upload + New folder CTAs when grid is empty", async ({
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
          .getByRole("button", { name: /New folder/i }),
      ).toBeVisible();
    });

    test("New folder CTA is disabled when storage isn't reachable", async ({
      page,
    }) => {
      // The CTA is the header's control, so it reports the same blocked reason
      // rather than offering a click that cannot land.
      await stubStorageApis(page, { storageEnabled: false });
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".files-page-empty")).toBeVisible({
        timeout: 5_000,
      });
      const createCta = page
        .locator(".files-page-empty-actions")
        .getByRole("button", { name: /New folder/i });
      await expect(createCta).toBeVisible();
      await expect(createCta).toBeDisabled();
    });
  });

  test.describe("Move dialog inline create-folder", () => {
    // The inline create-folder affordance is gated on `serverReachable`, which
    // only flips true once a confirmed, non-anonymous user triggers the folder
    // pull (see FolderContext). Seed a JWT so the stubbed session is logged-in.
    test.use({ autoGoto: false, seedJwt: true });

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
      // routed the user to the viewer (the editor).
      await expect(page).toHaveURL(/\/editor(\?|$)/, { timeout: 5_000 });
      expect(downloadHit).toBe(true);
    });

    test("Shared-link file appears in /files and materializes on open", async ({
      page,
    }) => {
      await stubStorageApis(page, { sharingEnabled: true });
      const SHARE_TOKEN = "tok-abc-123";
      // Owner-side listing has no entry for the shared file.
      await page.route("**/api/v1/storage/files", (route: Route) =>
        route.fulfill({ json: [] }),
      );
      await page.route(
        "**/api/v1/storage/share-links/accessed",
        (route: Route) =>
          route.fulfill({
            json: [
              {
                shareToken: SHARE_TOKEN,
                fileId: 4242,
                fileName: "shared-report.pdf",
                owner: "alice",
                ownedByCurrentUser: false,
                createdAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString(),
              },
            ],
          }),
      );
      let shareDownloadHit = false;
      await page.route(
        `**/api/v1/storage/share-links/${SHARE_TOKEN}`,
        (route: Route) => {
          shareDownloadHit = true;
          route.fulfill({
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'attachment; filename="shared-report.pdf"',
            },
            body: Buffer.from("%PDF-1.4\n%%EOF", "utf8"),
          });
        },
      );
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      const card = page
        .locator(".files-page-card:not(.is-folder)")
        .filter({ hasText: "shared-report.pdf" });
      await expect(card).toBeVisible({ timeout: 5_000 });
      // Open the card and confirm the share-link download endpoint fires.
      await card.getByRole("button", { name: /File actions/i }).click();
      await page.getByRole("menuitem", { name: /Add to workspace/i }).click();
      await expect(page).toHaveURL(/\/editor(\?|$)/, { timeout: 5_000 });
      expect(shareDownloadHit).toBe(true);
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

    test("Shared-by-me tab lists only files I own with share links", async ({
      page,
    }) => {
      await stubStorageApis(page, { sharingEnabled: true });
      // Three server files: one shared via link (owned by me), one shared
      // with users (owned by me), one plain mine, and one owned by someone else.
      await page.route("**/api/v1/storage/files", (route: Route) =>
        route.fulfill({
          json: [
            {
              id: 1,
              fileName: "link-shared.pdf",
              contentType: "application/pdf",
              sizeBytes: 100,
              createdAt: new Date().toISOString(),
              owner: "admin",
              ownedByCurrentUser: true,
              accessRole: "owner",
              shareLinks: [{ token: "tok1" }],
              sharedUsers: [],
              filePurpose: "generic",
              folderId: null,
            },
            {
              id: 2,
              fileName: "user-shared.pdf",
              contentType: "application/pdf",
              sizeBytes: 100,
              createdAt: new Date().toISOString(),
              owner: "admin",
              ownedByCurrentUser: true,
              accessRole: "owner",
              shareLinks: [],
              sharedUsers: [{ username: "bob" }],
              filePurpose: "generic",
              folderId: null,
            },
            {
              id: 3,
              fileName: "plain-mine.pdf",
              contentType: "application/pdf",
              sizeBytes: 100,
              createdAt: new Date().toISOString(),
              owner: "admin",
              ownedByCurrentUser: true,
              accessRole: "owner",
              shareLinks: [],
              sharedUsers: [],
              filePurpose: "generic",
              folderId: null,
            },
            {
              id: 4,
              fileName: "from-someone-else.pdf",
              contentType: "application/pdf",
              sizeBytes: 100,
              createdAt: new Date().toISOString(),
              owner: "alice",
              ownedByCurrentUser: false,
              accessRole: "viewer",
              shareLinks: [],
              sharedUsers: [],
              filePurpose: "generic",
              folderId: null,
            },
          ],
        }),
      );
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      // Wait for the 4 cards to land via server sync.
      await expect(
        page.locator(".files-page-card:not(.is-folder)"),
      ).toHaveCount(4, { timeout: 5_000 });

      // "Shared by me" -> link-shared.pdf AND user-shared.pdf
      // (The previously-separate "Shared by me" / "I'm sharing" tabs are now
      // merged into a single Shared-by-me view that shows both link shares
      // and direct user shares.)
      await page.locator("#filesPage-tab-sharedByMe").click();
      const sharedByMeCards = page.locator(".files-page-card:not(.is-folder)");
      await expect(sharedByMeCards).toHaveCount(2, { timeout: 5_000 });
      for (const name of ["link-shared.pdf", "user-shared.pdf"]) {
        await expect(sharedByMeCards.filter({ hasText: name })).toHaveCount(1);
      }

      // "Shared with me" -> only from-someone-else.pdf
      await page.locator("#filesPage-tab-shared").click();
      const sharedWithMeCards = page.locator(
        ".files-page-card:not(.is-folder)",
      );
      await expect(sharedWithMeCards).toHaveCount(1, { timeout: 3_000 });
      await expect(sharedWithMeCards.first()).toContainText(
        "from-someone-else.pdf",
      );
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

  test.describe("Folder navigation", () => {
    const FOLDER_ID = "11111111-2222-4333-8444-555555555555";
    test.beforeEach(async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(
        page,
        [
          { id: "nav-outside", name: "nav-outside.pdf", remoteStorageId: null },
          {
            id: "nav-inside",
            name: "nav-inside.pdf",
            remoteStorageId: null,
            folderId: FOLDER_ID,
          },
        ],
        [{ id: FOLDER_ID, name: "Invoices" }],
      );
    });
    test.use({ autoGoto: false });

    const intoFolder = async (page: Page) => {
      const tree = page.getByRole("tree", { name: /Folders/i });
      await expect(tree).toBeVisible({ timeout: 10_000 });
      await tree.getByRole("treeitem", { name: /Invoices/i }).click();
      await expect(page).toHaveURL(new RegExp(`/files/${FOLDER_ID}`), {
        timeout: 5_000,
      });
    };

    /**
     * A breadcrumb is a plain jump to an ancestor. Everything the selection change
     * drives - the listing, the folder filters, the path write - has to survive it.
     */
    test("clicking a breadcrumb returns to the root without throwing", async ({
      page,
    }) => {
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      await intoFolder(page);

      const crumbs = page.getByRole("navigation", { name: /Folder path/i });
      await expect(crumbs).toBeVisible({ timeout: 5_000 });
      await crumbs.getByRole("button", { name: /All files/i }).click();

      await expect(page).toHaveURL(/\/files\/?$/, { timeout: 5_000 });
      await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
      // Still a working library, not a husk.
      await expect(page.getByRole("tree", { name: /Folders/i })).toBeVisible();
    });

    /** Each folder is its own history entry, so Back walks up the tree rather than
     *  out of the library, and Forward returns to the folder. */
    test("back leaves the folder rather than the library, and forward returns", async ({
      page,
    }) => {
      await page.goto("/files", { waitUntil: "domcontentloaded" });
      await intoFolder(page);
      const deep = page.url();

      await page.goBack();
      await expect(page).toHaveURL(/\/files\/?$/, { timeout: 5_000 });
      await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);

      await page.goForward();
      await expect(page).toHaveURL(deep, { timeout: 5_000 });
      await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    });
  });

  test.describe("Long lists", () => {
    test.use({ autoGoto: false });

    /**
     * A folder can hold thousands of files, so the grid renders a window of them plus
     * a spacer at each end rather than the whole list. Needs a real browser: without
     * layout the window stands down and everything renders, which is the intended
     * fallback but proves nothing about the windowing.
     */
    test("renders a window of a long list, not all of it", async ({ page }) => {
      const COUNT = 400;
      await stubStorageApis(page);
      await seedFiles(
        page,
        Array.from({ length: COUNT }, (_, i) => ({
          id: `bulk-${i}`,
          name: `bulk-${String(i).padStart(4, "0")}.pdf`,
          remoteStorageId: null,
        })),
      );
      await gotoFilesPage(page);

      const cards = page.locator(
        ".files-page-card:not(.files-page-skeleton-card)",
      );
      const rendered = await cards.count();
      expect(rendered).toBeGreaterThan(0);
      expect(rendered).toBeLessThan(COUNT / 2);

      // The spacers stand in for the rest, so the scroll height still reflects the
      // whole folder rather than only what is mounted.
      const scroller = page.locator(".files-page-content");
      const metrics = await scroller.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight * 3);

      // Scrolling to the end swaps the window rather than growing it.
      const firstBefore = await cards.first().textContent();
      await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect
        .poll(async () => cards.first().textContent(), { timeout: 5_000 })
        .not.toBe(firstBefore);
      expect(await cards.count()).toBeLessThan(COUNT / 2);
    });
  });
});
