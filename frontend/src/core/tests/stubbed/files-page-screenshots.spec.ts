import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "node:path";

/**
 * Screenshot-driven visual review of the /files page surfaces added in
 * this PR (empty-state CTAs, sub-toolbar, Save to server entry points,
 * Move dialog inline create-folder). Runs as a stubbed spec so it stays
 * deterministic and offline-friendly. Each test dumps a PNG under
 * `screenshots/files-page/<scenario>.png` so a human (or the agent) can
 * eyeball the result without spinning up the live backend.
 */

interface SeedFile {
  id: string;
  name: string;
  remoteStorageId: number | null;
}

async function seedFiles(page: Page, files: SeedFile[]): Promise<void> {
  await page.addInitScript((records) => {
    const open = window.indexedDB.open("stirling-pdf-files", 4);
    open.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // The app expects BOTH `files` and `folders` stores on this DB.
      // Seeding only `files` makes subsequent folderStorage transactions
      // throw "One of the specified object stores was not found", which
      // surfaces as a red error banner in the UI. Create both.
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
  // Give Mantine portals + drawer/modal transitions time to land. The
  // animations are usually <200ms; 350 is a safe upper bound that won't
  // bloat the spec runtime.
  await page.waitForTimeout(ms);
}

test.describe("Files page screenshots", () => {
  test.use({ autoGoto: false, viewport: { width: 1600, height: 900 } });

  test("01_empty_state_ctas", async ({ page }) => {
    await stubStorageApis(page);
    // No seedFiles - grid renders empty so the CTAs are the focus.
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
    });
    await page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" })
      .click();
    // Right panel should now show the file details + Save to server button.
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
    });
    const card = page
      .locator(".files-page-card:not(.is-folder)")
      .filter({ hasText: "alpha.pdf" });
    await card.getByRole("button", { name: /File actions/i }).click();
    await page.getByRole("menuitem", { name: /Move to/i }).click();
    await expect(
      page.getByRole("dialog", { name: /Move to folder/i }),
    ).toBeVisible();
    // Click the "Create new folder…" toggle inside the dialog.
    await page.getByRole("button", { name: /Create new folder/i }).click();
    // Inline input + Create button now visible.
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("09_subtoolbar_narrow_viewport") });
  });

  test("08b_move_dialog_after_create_folder", async ({ page }) => {
    // Stub the create-folder POST so the dialog gets a real folder back
    // and reflects the new selection.
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.route(
      "**/api/v1/storage/folders",
      async (route: Route) => {
        if (route.request().method() === "POST") {
          // FolderId is a UUID-branded string - parseFolderId rejects
          // anything that isn't RFC-4122 shaped, so any made-up id like
          // "new-folder-id" would explode here. Use a real UUID literal.
          await route.fulfill({
            json: {
              id: "11111111-2222-4333-8444-555555555555",
              name: "Reports",
              parentFolderId: null,
              color: null,
              icon: null,
              // ISO strings - parseTimestamp goes through Date.parse so a
              // bare millis-since-epoch number triggers an "Invalid
              // timestamp" error.
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    // The inline create row should collapse back to the toggle button -
    // proves the create succeeded and the new folder is now the move
    // target.
    await expect(
      page.getByRole("button", { name: /Create new folder/i }),
    ).toBeVisible({ timeout: 3_000 });
    await settle(page);
    await page.screenshot({
      path: shotPath("08b_move_dialog_after_create_folder"),
    });
  });

  // ─── Dark mode pass ─────────────────────────────────────────────────────
  // Same scenarios as the headline grid + empty-state + dialog shots, but
  // with the page forced into dark mode. The Mantine color scheme is
  // controlled by localStorage; setting it before goto avoids a flash of
  // light mode during the first render.

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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
  // Same coverage in RTL (dir=rtl, Arabic locale fallback) so the new
  // surfaces (sub-toolbar, empty-state CTAs, Move dialog inline create
  // folder, details panel) flip correctly without breaking layout.
  // The app reads `dir` from <html dir=...>; setting it via initScript
  // before the first paint avoids a flash of LTR.

  async function enableRtl(page: Page): Promise<void> {
    // Seed BOTH the language and the dir attribute. The app's i18n init
    // sets dir="rtl" only when the active i18n language is in the
    // rtlLanguages list ("ar-AR" / "fa-IR"); setting just dir would be
    // clobbered when i18n loads. Setting both the storage keys it uses
    // (`i18nextLng` + the source flag) AND the dir attribute eagerly
    // means the page renders RTL from the first paint.
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
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

  test("10_subtoolbar_phone_hidden", async ({ page }) => {
    await stubStorageApis(page);
    await seedFiles(page, [
      { id: "alpha", name: "alpha.pdf", remoteStorageId: null },
    ]);
    await page.setViewportSize({ width: 500, height: 900 });
    await page.goto("/files", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".files-page-card").first()).toBeVisible({
      timeout: 5_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("10_subtoolbar_phone_hidden") });
  });
});
