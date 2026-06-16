import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "node:path";
import { DATABASE_CONFIGS } from "@app/services/indexedDBManager";

/** Screenshot review of /files surfaces; dumps PNGs to screenshots/files-page. */

interface SeedFile {
  id: string;
  name: string;
  remoteStorageId: number | null;
  folderId?: string | null;
}

async function seedFiles(page: Page, files: SeedFile[]): Promise<void> {
  // Build the server-side view from the cloud entries so reconcileServerFiles
  // sees them as still-existing on the server (otherwise they get detached
  // and the cloud cards vanish before the screenshot is taken).
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
    ({ records, dbVersion }) => {
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
      };
      open.onsuccess = () => {
        const db = open.result;
        // Yield the connection if the app ever needs to upgrade, and drop it
        // once the writes commit, so the seed never blocks the app's open.
        db.onversionchange = () => db.close();
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
            data: new ArrayBuffer(8),
            thumbnail: null,
            isLeaf: true,
            versionNumber: 1,
            originalFileId: f.id,
            parentFileId: null,
            toolHistory: [],
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
    { records: files, dbVersion: DATABASE_CONFIGS.FILES.version },
  );
}

async function stubStorageApis(
  page: Page,
  opts: { storageEnabled?: boolean } = {},
): Promise<void> {
  const { storageEnabled = true } = opts;
  const configPayload = {
    appVersion: "test",
    storageEnabled,
    storageSharingEnabled: false,
    storageShareLinksEnabled: false,
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

const SCREENSHOTS_DIR = path.resolve(
  process.cwd(),
  "screenshots",
  "files-page",
);

function shotPath(name: string): string {
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

async function settle(page: Page, ms = 350): Promise<void> {
  // Let Mantine portal transitions settle.
  await page.waitForTimeout(ms);
}

test.describe("Files page screenshots", () => {
  // Seed a logged-in session: the cloud-folder surfaces (move-dialog
  // create-folder, the seeded "Reports" folder) only render once a confirmed,
  // non-anonymous user triggers the folder pull (see FolderContext gating).
  test.use({
    autoGoto: false,
    viewport: { width: 1600, height: 900 },
    seedJwt: true,
  });

  test("01_empty_state_ctas", async ({ page }) => {
    await stubStorageApis(page);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".files-page-empty")).toBeVisible({
      timeout: 5_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("01_empty_state_ctas") });
  });

  test("02_empty_state_storage_off", async ({ page }) => {
    await stubStorageApis(page, { storageEnabled: false });
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".files-page-empty")).toBeVisible({
      timeout: 5_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("02_empty_state_storage_off") });
  });

  test("03_subtoolbar_with_files", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
      { id: "bravo", name: "bravo.pdf", remoteStorageId: null },
      { id: "cloud-c", name: "cloud-c.pdf", remoteStorageId: 1001 },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("03_subtoolbar_with_files") });
  });

  test("04_kebab_save_to_server_local", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" });
    await card.getByRole("button", { name: /File actions/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /^Save to server$/i }),
    ).toBeVisible();
    await settle(page);
    await page.screenshot({ path: shotPath("04_kebab_save_to_server_local") });
  });

  test("05_kebab_no_save_to_server_cloud", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "cloud-c", name: "cloud-c.pdf", remoteStorageId: 1001 },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "cloud-c.pdf" });
    await card.getByRole("button", { name: /File actions/i }).click();
    await settle(page);
    await page.screenshot({
      path: shotPath("05_kebab_no_save_to_server_cloud"),
    });
  });

  test("06_details_panel_save_to_server", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" })
      .click();
    await expect(page.locator(".files-page-details")).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath("06_details_panel_save_to_server"),
    });
  });

  test("07_move_dialog_collapsed", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" });
    await card.getByRole("button", { name: /File actions/i }).click();
    await page.getByRole("menuitem", { name: /Move to/i }).click();
    await expect(
      page.getByRole("dialog", { name: /Move to folder/i }),
    ).toBeVisible();
    await settle(page);
    await page.screenshot({ path: shotPath("07_move_dialog_collapsed") });
  });

  test("08_move_dialog_create_folder_expanded", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" });
    await card.getByRole("button", { name: /File actions/i }).click();
    await page.getByRole("menuitem", { name: /Move to/i }).click();
    await expect(
      page.getByRole("dialog", { name: /Move to folder/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Create new folder/i }).click();
    await expect(
      page.getByRole("textbox", { name: /New folder name/i }),
    ).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath("08_move_dialog_create_folder_expanded"),
    });
  });

  test("09_subtoolbar_narrow_viewport", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "viewport-resize spec");
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("09_subtoolbar_narrow_viewport") });
  });

  test("08b_move_dialog_after_create_folder", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.route(
      "**/api/v1/storage/folders",
      async (route: Route) => {
        if (route.request().method() === "POST") {
          // FolderId must be a UUID; timestamps must be ISO strings.
          await route.fulfill({
            json: {
              id: "11111111-2222-4333-8444-555555555555",
              name: "Reports",
              parentFolderId: null,
              color: null,
              icon: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          });
          return;
        }
        await route.fulfill({ json: [] });
      },
      { times: 5 },
    );
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" });
    await card.getByRole("button", { name: /File actions/i }).click();
    await page.getByRole("menuitem", { name: /Move to/i }).click();
    await page.getByRole("button", { name: /Create new folder/i }).click();
    await page
      .getByRole("textbox", { name: /New folder name/i })
      .fill("Reports");
    await page.getByRole("button", { name: /^Create$/i }).click();
    // Inline row collapses back; create succeeded.
    await expect(
      page.getByRole("button", { name: /Create new folder/i }),
    ).toBeVisible({ timeout: 3_000 });
    await settle(page);
    await page.screenshot({
      path: shotPath("08b_move_dialog_after_create_folder"),
    });
  });

  // ─── Dark mode pass ─────────────────────────────────────────────────────
  async function enableDarkMode(page: Page): Promise<void> {
    await page.addInitScript(() => {
      localStorage.setItem("mantine-color-scheme", "dark");
      localStorage.setItem("mantine-color-scheme-value", "dark");
    });
    await page.emulateMedia({ colorScheme: "dark" });
  }

  test("11_dark_empty_state_ctas", async ({ page }) => {
    await enableDarkMode(page);
    await stubStorageApis(page);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".files-page-empty")).toBeVisible({
      timeout: 5_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("11_dark_empty_state_ctas") });
  });

  test("12_dark_subtoolbar_with_files", async ({ page }) => {
    await enableDarkMode(page);
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
      { id: "bravo", name: "bravo.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("12_dark_subtoolbar_with_files") });
  });

  test("13_dark_move_dialog_create_folder", async ({ page }) => {
    await enableDarkMode(page);
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" });
    await card.getByRole("button", { name: /File actions/i }).click();
    await page.getByRole("menuitem", { name: /Move to/i }).click();
    await page.getByRole("button", { name: /Create new folder/i }).click();
    await expect(
      page.getByRole("textbox", { name: /New folder name/i }),
    ).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath("13_dark_move_dialog_create_folder"),
    });
  });

  // ─── RTL pass ────────────────────────────────────────────────────────────
  async function enableRtl(page: Page): Promise<void> {
    // Seed language + dir before first paint.
    await page.addInitScript(() => {
      localStorage.setItem("i18nextLng", "ar-AR");
      localStorage.setItem("stirling-language", "ar-AR");
      localStorage.setItem("stirling-language-source", "user");
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    });
  }

  test("15_rtl_empty_state_ctas", async ({ page }) => {
    await enableRtl(page);
    await stubStorageApis(page);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".files-page-empty")).toBeVisible({
      timeout: 5_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("15_rtl_empty_state_ctas") });
  });

  test("16_rtl_subtoolbar_with_files", async ({ page }) => {
    await enableRtl(page);
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
      { id: "bravo", name: "bravo.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("16_rtl_subtoolbar_with_files") });
  });

  test("17_rtl_move_dialog_create_folder", async ({ page }) => {
    await enableRtl(page);
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" });
    // Locate by stable test ids, not translated accessible names: this test
    // runs in Arabic (enableRtl), so English-text locators break once the
    // ar-AR strings are actually translated.
    await card.getByTestId("file-card-actions").click();
    await page.getByTestId("file-menu-move-to").click();
    await page.getByTestId("move-dialog-create-folder-toggle").click();
    await expect(page.getByTestId("move-dialog-new-folder-name")).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath("17_rtl_move_dialog_create_folder"),
    });
  });

  test("18_rtl_details_panel_save_to_server", async ({ page }) => {
    await enableRtl(page);
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" })
      .click();
    await expect(page.locator(".files-page-details")).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath("18_rtl_details_panel_save_to_server"),
    });
  });

  test("14_dark_details_panel_save_to_server", async ({ page }) => {
    await enableDarkMode(page);
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" })
      .click();
    await expect(page.locator(".files-page-details")).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath("14_dark_details_panel_save_to_server"),
    });
  });

  test("19_delete_folder_dialog", async ({ page }) => {
    const FOLDER_ID = "22222222-2222-4333-8444-555555555555";
    await stubStorageApis(page);
    // Seed a file inside the Reports folder so the checkbox appears.
    await seedFiles(page, [
      {
        id: "alpha",
        name: "alpha.pdf",
        remoteStorageId: 9001,
        folderId: FOLDER_ID,
      },
      {
        id: "bravo",
        name: "bravo.pdf",
        remoteStorageId: 9002,
        folderId: FOLDER_ID,
      },
    ]);
    await page.route("**/api/v1/storage/folders", async (route: Route) => {
      await route.fulfill({
        json: [
          {
            id: FOLDER_ID,
            name: "Reports",
            parentFolderId: null,
            color: null,
            icon: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });
    });
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    // Wait for the Reports folder card or list row.
    await expect(page.getByText("Reports").first()).toBeVisible({
      timeout: 5_000,
    });
    // Open the kebab on the folder card.
    const folderCard = page
      .locator(".files-page-card.is-folder")
      .filter({ hasText: "Reports" })
      .first();
    await folderCard.getByRole("button", { name: /Folder actions/i }).click();
    await page.getByRole("menuitem", { name: /Delete folder/i }).click();
    await expect(
      page.getByRole("dialog", { name: /Delete folder\?/i }),
    ).toBeVisible({ timeout: 3_000 });
    await settle(page);
    await page.screenshot({ path: shotPath("19_delete_folder_dialog") });
  });

  test("10_subtoolbar_phone_hidden", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.setViewportSize({ width: 500, height: 900 });
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("10_subtoolbar_phone_hidden") });
  });
});
