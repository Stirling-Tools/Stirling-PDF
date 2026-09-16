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
  parentFolderId?: string;
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
            parentFolderId: folder.parentFolderId ?? null,
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
  // Most of these read the library as cards.
  test.use({ filesViewMode: "grid" });

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
      // The details panel offers it directly; the selection's copy lives behind
      // the Actions menu.
      await expect(
        page.getByRole("button", { name: /^Save to server$/i }),
      ).toHaveCount(1);
      await page
        .locator(
          ".files-page-selection-actions .files-page-toolbar-bulk-trigger",
        )
        .click();
      await expect(
        page.getByRole("menuitem", { name: /^Save to server$/i }),
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
  });

  test.describe("Folder chrome stability", () => {
    const CHROME_FOLDER = "11111111-2222-4333-8444-555555555561";
    test.use({ autoGoto: false });

    /** The sidebar is sized by the user, not by its contents: a long name has to give
     *  way inside the row rather than push the sidebar wider. */
    test("a long folder name does not widen the file sidebar", async ({
      page,
    }) => {
      await stubStorageApis(page);
      await seedFiles(
        page,
        [{ id: "w-1", name: "w-1.pdf", remoteStorageId: null }],
        [
          {
            id: CHROME_FOLDER,
            name: "Quarterly reconciliation attachments 2024 final v3",
          },
        ],
      );
      await gotoFilesPage(page);

      const sidebar = page.locator(".file-sidebar");
      await expect(sidebar).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByRole("treeitem", { name: /Quarterly/i }),
      ).toBeVisible();

      const width = await sidebar.evaluate(
        (el) => el.getBoundingClientRect().width,
      );
      expect(width).toBeLessThanOrEqual(320);
      // Clipped inside the row rather than laid out at full length.
      const clipped = await page
        .locator(".files-page-tree-name-head")
        .first()
        .evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped).toBe(true);
    });

    /** Depth is what grows the bar, so the trail has to stop showing more of it. */
    test("a deep trail does not change the header height", async ({ page }) => {
      const ids = [
        "11111111-2222-4333-8444-555555555571",
        "11111111-2222-4333-8444-555555555572",
        "11111111-2222-4333-8444-555555555573",
        "11111111-2222-4333-8444-555555555574",
      ];
      const names = [
        "Client engagements and retainers",
        "Quarterly reconciliation attachments",
        "Supporting documentation bundle 2024",
        "Signed originals awaiting countersignature",
      ];
      await stubStorageApis(page);
      await seedFiles(
        page,
        [{ id: "d-1", name: "d-1.pdf", remoteStorageId: null }],
        ids.map((id, i) => ({
          id,
          name: names[i],
          parentFolderId: i === 0 ? undefined : ids[i - 1],
        })),
      );
      await gotoFilesPage(page);

      const header = page.locator(".files-page-tabs-row");
      const atRoot = await header.evaluate(
        (el) => el.getBoundingClientRect().height,
      );

      const tree = page.getByRole("tree", { name: /Folders/i });
      for (let i = 0; i < names.length; i += 1) {
        await tree
          .getByRole("treeitem", {
            name: new RegExp(names[i].slice(0, 12), "i"),
          })
          .first()
          .click();
        await expect(page).toHaveURL(new RegExp(ids[i]), { timeout: 5_000 });
      }
      const deep = await header.evaluate(
        (el) => el.getBoundingClientRect().height,
      );
      expect(deep).toBe(atRoot);
      // Two crumbs, whatever the depth; the rest live behind the overflow menu.
      await expect(page.locator(".files-page-breadcrumb")).toHaveCount(2);
      await expect(
        page.locator(".files-page-breadcrumb-overflow"),
      ).toBeVisible();
    });

    /** Walking into a folder must not resize the bar the breadcrumb sits in - the
     *  grid below it would jump by however much the header grew. */
    test("entering a folder does not change the header height", async ({
      page,
    }) => {
      await stubStorageApis(page);
      await seedFiles(
        page,
        [{ id: "h-1", name: "h-1.pdf", remoteStorageId: null }],
        [{ id: CHROME_FOLDER, name: "Invoices" }],
      );
      await gotoFilesPage(page);

      const header = page.locator(".files-page-tabs-row");
      const atRoot = await header.evaluate(
        (el) => el.getBoundingClientRect().height,
      );

      await page.getByRole("treeitem", { name: /Invoices/i }).click();
      await expect(page).toHaveURL(new RegExp(CHROME_FOLDER), {
        timeout: 5_000,
      });
      const inFolder = await header.evaluate(
        (el) => el.getBoundingClientRect().height,
      );

      expect(inFolder).toBe(atRoot);
    });
  });

  test.describe("List view", () => {
    test.use({ autoGoto: false, filesViewMode: null });

    const FOLDER = "11111111-2222-4333-8444-555555555595";

    /** The library opens as a list, and remembers the grid once it is chosen. */
    test("is where the library starts, and the choice sticks", async ({
      page,
    }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "l-1", name: "l-1.pdf", remoteStorageId: null },
      ]);
      await page.goto("/files", { waitUntil: "domcontentloaded" });

      await expect(page.locator(".files-page-list-row").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator(".files-page-card")).toHaveCount(0);

      await page
        .locator('.files-page-view-toggle-icon[title="Grid view"]')
        .first()
        .click();
      await expect(page.locator(".files-page-card").first()).toBeVisible();

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".files-page-card").first()).toBeVisible({
        timeout: 15_000,
      });
    });

    /** A processing folder tells the same story in either view. */
    test("a processing folder carries its counts in a row", async ({
      page,
    }) => {
      await stubStorageApis(page);
      await seedFiles(
        page,
        [{ id: "l-2", name: "l-2.pdf", remoteStorageId: null }],
        [{ id: FOLDER, name: "Scans" }],
      );
      await page.goto("/files", { waitUntil: "domcontentloaded" });

      const row = page
        .locator(".files-page-list-row")
        .filter({ hasText: "Scans" });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.getByRole("button", { name: /folder actions/i }).click();
      await expect(
        page.getByRole("menuitem", { name: /Process files in this folder/i }),
      ).toBeVisible();
    });
  });

  test.describe("Selection chrome", () => {
    test.use({ autoGoto: false, filesViewMode: null });

    /** Guards the bug that put selection actions in their own row: a toolbar
     *  that wraps on selection moves every row down, and the second click of a
     *  double-click lands on the wrong file. */
    test("selecting files does not move the listing", async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "s-1", name: "alpha.pdf", remoteStorageId: null },
        { id: "s-2", name: "beta.pdf", remoteStorageId: null },
        { id: "s-3", name: "gamma.pdf", remoteStorageId: null },
      ]);
      await page.goto("/files", { waitUntil: "domcontentloaded" });

      const rows = page.locator(".files-page-list-row:not(.is-header)");
      await expect(rows.first()).toBeVisible({ timeout: 15_000 });
      const topOf = async () =>
        (await rows.first().boundingBox())?.y ?? Number.NaN;

      const before = await topOf();
      await rows.nth(0).click();
      await rows.nth(1).click({ modifiers: ["ControlOrMeta"] });
      await expect(page.locator(".files-page-list-selection-count")).toHaveText(
        /2 selected/i,
      );
      expect(await topOf()).toBeCloseTo(before, 0);
    });
  });

  test.describe("Library chrome placement", () => {
    test.use({ autoGoto: false });

    test("the path is on the library row and the actions are in the sidebar", async ({
      page,
    }) => {
      const NESTED = "11111111-2222-4333-8444-555555555581";
      const PARENT = "11111111-2222-4333-8444-555555555580";
      await stubStorageApis(page);
      await seedFiles(
        page,
        [{ id: "b-1", name: "b-1.pdf", remoteStorageId: null }],
        [
          { id: PARENT, name: "Engagements" },
          { id: NESTED, name: "Signed originals", parentFolderId: PARENT },
        ],
      );
      await gotoFilesPage(page);

      const bar = page.locator(".workbench-bar");
      await expect(bar).toBeVisible({ timeout: 10_000 });
      const row = page.locator(".files-page-tabs-row");
      // On the library's row, and not in the bar above it.
      await expect(
        row.getByRole("navigation", { name: /Folder path/i }),
      ).toBeVisible();
      await expect(
        row.getByRole("button", { name: /New folder/i }),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="files-rail-new-folder"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="files-rail-refresh"]'),
      ).toBeVisible();
      await expect(
        bar.getByRole("navigation", { name: /Folder path/i }),
      ).toHaveCount(0);

      const tree = page.getByRole("tree", { name: /Folders/i });
      await tree.getByRole("treeitem", { name: /Engagements/i }).click();
      await expect(page).toHaveURL(new RegExp(PARENT), { timeout: 5_000 });
      await tree.getByRole("treeitem", { name: /Signed originals/i }).click();
      await expect(page).toHaveURL(new RegExp(NESTED), { timeout: 5_000 });

      // Two crumbs whatever the depth, and the bar stays one row tall.
      await expect(page.locator(".files-page-breadcrumb")).toHaveCount(2);
      await expect(bar).toHaveAttribute("data-wrapped", "false");
    });
  });

  test.describe("Document actions in the library", () => {
    test.use({ autoGoto: false });

    /** Save, Save As and Close act on an open document, and the library has none.
     *  Desktop is where this shows: two save glyphs sit side by side there. */
    test("saving and closing are absent from the library", async ({ page }) => {
      await stubStorageApis(page);
      await seedFiles(page, [
        { id: "d-a", name: "d-a.pdf", remoteStorageId: null },
      ]);
      await gotoFilesPage(page);

      const bar = page.locator(".workbench-bar");
      await expect(bar).toBeVisible({ timeout: 10_000 });
      for (const name of [/^Save$/i, /Save As/i, /Close (All|PDF)/i]) {
        await expect(bar.getByRole("button", { name })).toHaveCount(0);
      }
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

    /**
     * Back walks up one level per press, and lands where it says it does. Anything
     * that writes the path in response to the selection can push the folder being
     * left back on top of the entry just landed on, which reads as a press that did
     * nothing.
     */
    test("back steps up one folder per press", async ({ page }) => {
      const NESTED = "11111111-2222-4333-8444-555555555556";
      await seedFiles(
        page,
        [
          {
            id: "nav-nested",
            name: "nav-nested.pdf",
            remoteStorageId: null,
            folderId: NESTED,
          },
        ],
        [
          { id: FOLDER_ID, name: "Invoices" },
          { id: NESTED, name: "Paid", parentFolderId: FOLDER_ID },
        ],
      );
      await page.goto("/files", { waitUntil: "domcontentloaded" });

      const tree = page.getByRole("tree", { name: /Folders/i });
      await expect(tree).toBeVisible({ timeout: 10_000 });
      await tree.getByRole("treeitem", { name: /Invoices/i }).click();
      await expect(page).toHaveURL(new RegExp(FOLDER_ID), { timeout: 5_000 });
      await tree.getByRole("treeitem", { name: /Paid/i }).click();
      await expect(page).toHaveURL(new RegExp(NESTED), { timeout: 5_000 });

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(FOLDER_ID), { timeout: 5_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/files\/?$/, { timeout: 5_000 });
      await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
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
