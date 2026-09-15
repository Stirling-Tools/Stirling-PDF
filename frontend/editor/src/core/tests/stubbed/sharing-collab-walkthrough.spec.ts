import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "node:path";
import { DATABASE_CONFIGS } from "@app/services/indexedDBManager";

/** Walkthrough shots for the sharing-collaboration feature (save-back, conflicts, badges). */

interface SeedFile {
  id: string;
  name: string;
  remoteStorageId: number | null;
  ownedByCurrentUser?: boolean;
  accessRole?: string;
  versionBase?: number;
  versionLatest?: number;
  sharedViaLink?: boolean;
  shareToken?: string | null;
  hasShareLinks?: boolean;
}

function serverEntry(f: SeedFile) {
  return {
    id: f.remoteStorageId,
    fileName: f.name,
    contentType: "application/pdf",
    sizeBytes: 1024,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    owner: f.ownedByCurrentUser === false ? "alice" : "testuser",
    ownedByCurrentUser: f.ownedByCurrentUser !== false,
    accessRole: f.accessRole ?? "editor",
    version: f.versionLatest ?? f.versionBase ?? 0,
    shareLinks: f.hasShareLinks ? [{ token: "tok-1" }] : [],
    sharedUsers: [],
    filePurpose: "generic",
    folderId: null,
  };
}

async function seedFiles(page: Page, files: SeedFile[]): Promise<void> {
  const serverFiles = files
    .filter((f) => f.remoteStorageId != null)
    .map(serverEntry);
  await page.route("**/api/v1/storage/files", (route: Route) =>
    route.fulfill({ json: serverFiles }),
  );
  await page.addInitScript(
    ({ records, dbVersion }) => {
      const open = window.indexedDB.open("stirling-pdf-files", dbVersion);
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
            folderId: null,
            remoteStorageId: f.remoteStorageId,
            remoteStorageUpdatedAt: f.remoteStorageId ? now : null,
            remoteOwnerUsername: f.remoteStorageId
              ? f.ownedByCurrentUser === false
                ? "alice"
                : "testuser"
              : null,
            remoteOwnedByCurrentUser: f.remoteStorageId
              ? (f.ownedByCurrentUser ?? true)
              : null,
            remoteAccessRole: f.remoteStorageId
              ? (f.accessRole ?? "editor")
              : null,
            remoteVersionBase: f.versionBase ?? null,
            remoteVersionLatest: f.versionLatest ?? f.versionBase ?? null,
            remoteSharedViaLink: f.sharedViaLink ?? false,
            remoteHasShareLinks: f.hasShareLinks ?? false,
            remoteShareToken: f.shareToken ?? null,
          });
        }
        tx.oncomplete = () => db.close();
      };
    },
    { records: files, dbVersion: DATABASE_CONFIGS.FILES.version },
  );
}

async function stubStorageApis(page: Page): Promise<void> {
  const configPayload = {
    appVersion: "test",
    storageEnabled: true,
    storageSharingEnabled: true,
    storageShareLinksEnabled: true,
    frontendUrl: "http://localhost:5173",
  };
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({ json: configPayload }),
  );
  await page.route("**/api/v1/config", (route: Route) =>
    route.fulfill({ json: configPayload }),
  );
  await page.route("**/api/v1/storage/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
}

const SCREENSHOTS_DIR = path.resolve(
  process.cwd(),
  "screenshots",
  "sharing-collab",
);

function shotPath(name: string): string {
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

async function settle(page: Page, ms = 350): Promise<void> {
  await page.waitForTimeout(ms);
}

async function enableDarkMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function enableRtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "ar-AR");
    localStorage.setItem("stirling-language", "ar-AR");
    localStorage.setItem("stirling-language-source", "user");
    const applyDir = () => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    };
    if (document.documentElement) applyDir();
    else document.addEventListener("DOMContentLoaded", applyDir);
  });
}

const GRID_FILES: SeedFile[] = [
  // Owned cloud file with an active share link.
  {
    id: "mine",
    name: "my-report.pdf",
    remoteStorageId: 1001,
    ownedByCurrentUser: true,
    accessRole: "editor",
    versionBase: 2,
    versionLatest: 2,
    hasShareLinks: true,
  },
  // Shared with me as editor, in sync.
  {
    id: "shared-editor",
    name: "team-budget.pdf",
    remoteStorageId: 2001,
    ownedByCurrentUser: false,
    accessRole: "editor",
    versionBase: 3,
    versionLatest: 3,
  },
  // Shared with me as editor, server moved on (update available).
  {
    id: "shared-stale",
    name: "contract-draft.pdf",
    remoteStorageId: 2002,
    ownedByCurrentUser: false,
    accessRole: "editor",
    versionBase: 1,
    versionLatest: 4,
  },
  // Shared with me read-only.
  {
    id: "shared-viewer",
    name: "signed-nda.pdf",
    remoteStorageId: 2003,
    ownedByCurrentUser: false,
    accessRole: "viewer",
    versionBase: 1,
    versionLatest: 1,
  },
];

async function gotoGrid(page: Page): Promise<void> {
  await page.goto("/files", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator(".files-page-card:not(.files-page-skeleton-card)").first(),
  ).toBeVisible({ timeout: 10_000 });
  await settle(page);
}

function card(page: Page, name: string) {
  return page
    .locator(".files-page-card:not(.is-folder)")
    .filter({ hasText: name });
}

async function openSaveToSharedModal(page: Page): Promise<void> {
  await card(page, "team-budget.pdf").getByTestId("file-card-actions").click();
  await page.getByTestId("file-menu-save-to-shared").click();
  await expect(
    page.getByRole("dialog", { name: /Save to Shared File/i }),
  ).toBeVisible();
  await settle(page);
}

test.describe("Sharing collaboration walkthrough", () => {
  test.use({
    autoGoto: false,
    viewport: { width: 1600, height: 900 },
    seedJwt: true,
  });

  for (const theme of ["light", "dark"] as const) {
    const dark = theme === "dark";
    const prep = async (page: Page) => {
      if (dark) await enableDarkMode(page);
      await stubStorageApis(page);
      await seedFiles(page, GRID_FILES);
    };

    test(`01_grid_badges_${theme}`, async ({ page }) => {
      await prep(page);
      await gotoGrid(page);
      await expect(page.locator(".files-page-card-update-badge")).toBeVisible();
      await page.screenshot({ path: shotPath(`01_grid_badges_${theme}`) });
    });

    test(`02_kebab_shared_editor_${theme}`, async ({ page }) => {
      await prep(page);
      await gotoGrid(page);
      await card(page, "team-budget.pdf")
        .getByTestId("file-card-actions")
        .click();
      await expect(page.getByTestId("file-menu-save-to-shared")).toBeVisible();
      await settle(page);
      await page.screenshot({
        path: shotPath(`02_kebab_shared_editor_${theme}`),
      });
    });

    test(`03_kebab_update_available_${theme}`, async ({ page }) => {
      await prep(page);
      await gotoGrid(page);
      await card(page, "contract-draft.pdf")
        .getByTestId("file-card-actions")
        .click();
      await expect(page.getByTestId("file-menu-get-latest")).toContainText(
        /new/i,
      );
      await settle(page);
      await page.screenshot({
        path: shotPath(`03_kebab_update_available_${theme}`),
      });
    });

    test(`04_kebab_shared_viewer_${theme}`, async ({ page }) => {
      await prep(page);
      await gotoGrid(page);
      await card(page, "signed-nda.pdf")
        .getByTestId("file-card-actions")
        .click();
      await expect(page.getByTestId("file-menu-get-latest")).toBeVisible();
      await expect(
        page.getByTestId("file-menu-save-to-shared"),
      ).not.toBeVisible();
      await settle(page);
      await page.screenshot({
        path: shotPath(`04_kebab_shared_viewer_${theme}`),
      });
    });

    test(`05_save_to_shared_modal_${theme}`, async ({ page }) => {
      await prep(page);
      await gotoGrid(page);
      await openSaveToSharedModal(page);
      await page.screenshot({
        path: shotPath(`05_save_to_shared_modal_${theme}`),
      });
    });

    test(`06_save_conflict_${theme}`, async ({ page }) => {
      await prep(page);
      // The write is rejected: someone else already bumped the version.
      await page.route("**/api/v1/storage/files/2001", (route: Route) => {
        if (route.request().method() === "PUT") {
          return route.fulfill({
            status: 409,
            json: { status: 409, detail: "File was modified by someone else" },
          });
        }
        return route.fulfill({ json: serverEntry(GRID_FILES[1]) });
      });
      await gotoGrid(page);
      await openSaveToSharedModal(page);
      await page.getByRole("button", { name: /Save changes/i }).click();
      await expect(
        page.getByText(/This file changed on the server/i),
      ).toBeVisible({ timeout: 5_000 });
      await settle(page);
      await page.screenshot({ path: shotPath(`06_save_conflict_${theme}`) });
    });

    test(`07_share_activity_edited_${theme}`, async ({ page }) => {
      await prep(page);
      await page.route("**/api/v1/storage/files/1001", (route: Route) =>
        route.fulfill({ json: serverEntry(GRID_FILES[0]) }),
      );
      await page.route(
        "**/api/v1/storage/files/1001/shares/links/tok-1/accesses",
        (route: Route) =>
          route.fulfill({
            json: [
              {
                username: "bob",
                accessType: "EDIT",
                accessedAt: new Date().toISOString(),
              },
              {
                username: "bob",
                accessType: "VIEW",
                accessedAt: new Date(Date.now() - 3600_000).toISOString(),
              },
            ],
          }),
      );
      await gotoGrid(page);
      await card(page, "my-report.pdf").click();
      await expect(page.locator(".files-page-details")).toBeVisible();
      await page.getByRole("button", { name: /Manage sharing/i }).click();
      await expect(
        page.getByRole("dialog", { name: /Manage Sharing/i }),
      ).toBeVisible();
      await expect(page.getByText(/^Edited$/).first()).toBeVisible({
        timeout: 5_000,
      });
      await settle(page);
      await page.screenshot({
        path: shotPath(`07_share_activity_edited_${theme}`),
      });
    });
  }

  test("08_rtl_grid_badges", async ({ page }) => {
    await enableRtl(page);
    await stubStorageApis(page);
    await seedFiles(page, GRID_FILES);
    await gotoGrid(page);
    await expect(page.locator(".files-page-card-update-badge")).toBeVisible();
    await page.screenshot({ path: shotPath("08_rtl_grid_badges_light") });
  });

  test("09_rtl_save_to_shared_modal", async ({ page }) => {
    await enableRtl(page);
    await stubStorageApis(page);
    await seedFiles(page, GRID_FILES);
    await gotoGrid(page);
    await card(page, "team-budget.pdf")
      .getByTestId("file-card-actions")
      .click();
    await page.getByTestId("file-menu-save-to-shared").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath("09_rtl_save_to_shared_modal_light"),
    });
  });
});
