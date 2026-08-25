// oxlint-disable typescript/no-explicit-any -- impersonates Tauri's untyped
// `__TAURI_INTERNALS__` bridge; typing it would re-declare Tauri's private IPC.
import { test } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/** Capture harness, not a regression test: fakes Tauri IPC over an in-memory disk.
 *  Needs `vite --mode desktop` (for desktopFileLinkingSupported) and SHOT_DIR set. */

const SHOT_DIR = process.env.SHOT_DIR;
// Playwright runs from the editor dir, so this is stable without __dirname
// (the config is ESM, where __dirname does not exist).
const FIXTURES = path.resolve("src/core/tests/test-fixtures");
// 1.08 KB and 1.55 KB - the two sizes the walkthrough quotes for the
// external-edit step, so the numbers on screen match the prose.
const PDF_SMALL = Array.from(
  fs.readFileSync(path.join(FIXTURES, "compare_sample_a.pdf")),
);
const PDF_LARGE = Array.from(
  fs.readFileSync(path.join(FIXTURES, "compare_sample_b.pdf")),
);

const MTIME = 1_700_000_000_000;
const P = {
  report: "C:/Docs/quarterly-report.pdf",
  notes: "C:/Docs/notes.pdf",
  archived: "C:/Docs/archived.pdf",
};

type DiskEntry = { bytes: number[]; modifiedMs: number };
type SeedFile = {
  id: string;
  name: string;
  path: string;
  bytes: number[];
  baseline?: { size: number; modifiedMs: number };
  isDirty?: boolean;
};

/** Fake Tauri IPC over an in-memory disk the test mutates between steps. */
async function installTauri(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.isTauri = true;
    // Init script re-runs on every navigation, so the disk lives in sessionStorage -
    // a reload would otherwise empty it and make every file look deleted.
    w.__disk = JSON.parse(sessionStorage.getItem("__disk") || "{}");
    w.__saveDisk = () =>
      sessionStorage.setItem("__disk", JSON.stringify(w.__disk));
    w.__callbacks = {};
    w.__listeners = {};
    let nextCb = 1;

    const stat = (p: string) => {
      const e = w.__disk[p];
      return e
        ? { exists: true, size: e.bytes.length, modifiedMs: e.modifiedMs }
        : { exists: false, size: 0, modifiedMs: 0 };
    };

    // Desktop API calls go through tauri-plugin-http, not window.fetch, so
    // page.route() never sees them; delegating to fetch restores interception.
    const httpReqs: Record<number, any> = {};
    const httpRes: Record<number, { body: Uint8Array; read: boolean }> = {};
    let nextRid = 1;

    w.__TAURI_INTERNALS__ = {
      // getCurrentWindow()/getCurrentWebview() read straight off this.
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
      },
      transformCallback(cb: (v: unknown) => void) {
        const id = nextCb++;
        w.__callbacks[id] = cb;
        return id;
      },
      unregisterListener() {},
      async invoke(cmd: string, args: any = {}) {
        switch (cmd) {
          case "file_disk_state":
            return stat(args.path);
          case "path_exists":
            return stat(args.path).exists;
          case "plugin:fs|read_file": {
            const e = w.__disk[args.path];
            if (!e) throw new Error(`ENOENT ${args.path}`);
            return e.bytes;
          }
          case "watch_disk_paths":
          case "unwatch_disk_paths":
            return null;

          case "plugin:http|fetch": {
            const rid = nextRid++;
            httpReqs[rid] = args.clientConfig;
            return rid;
          }
          case "plugin:http|fetch_send": {
            const cfg = httpReqs[args.rid];
            const res = await window.fetch(cfg.url, {
              method: cfg.method,
              headers: cfg.headers,
              body: cfg.data ? new Uint8Array(cfg.data) : undefined,
            });
            const bodyRid = nextRid++;
            httpRes[bodyRid] = {
              body: new Uint8Array(await res.arrayBuffer()),
              read: false,
            };
            return {
              status: res.status,
              statusText: res.statusText,
              url: res.url,
              headers: Array.from(res.headers.entries()),
              rid: bodyRid,
            };
          }
          case "plugin:http|fetch_read_body": {
            const entry = httpRes[args.rid];
            if (!entry || entry.read) return [1]; // terminator: stream closed
            entry.read = true;
            return [...entry.body, 0]; // 0 = more may follow
          }
          case "plugin:http|fetch_cancel":
          case "plugin:http|fetch_cancel_body":
            return null;

          case "plugin:event|listen":
            w.__listeners[args.event] = args.handler;
            return Object.keys(w.__listeners).length;
          case "plugin:event|unlisten":
            return null;

          case "get_backend_port":
            return 8080;
          case "pop_opened_files":
          case "get_opened_files":
          case "pop_window_file_ids":
            return [];
          case "get_desktop_os":
            return "windows";
          case "get_app_version":
            return "2.14.0";
          case "is_first_launch":
            return false;
          case "is_default_pdf_handler":
            return true;
          case "can_install_updates":
            return false;
          case "get_update_mode":
            return "manual";
          case "get_connection_config":
            return { mode: "local", serverUrl: null, setupCompleted: true };
          default:
            return null;
        }
      },
    };

    // `unlisten()` goes through this object, not __TAURI_INTERNALS__.
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener(event: string) {
        delete w.__listeners[event];
      },
    };

    /** Fire a watcher event at the app, as the Rust side would. */
    w.__emitDisk = (paths: string[]) => {
      const handler = w.__listeners["disk-files-changed"];
      if (handler && w.__callbacks[handler]) {
        w.__callbacks[handler]({
          event: "disk-files-changed",
          id: 1,
          payload: { paths },
        });
      }
    };
  });
}

async function setDisk(page: Page, disk: Record<string, DiskEntry>) {
  await page.evaluate((d) => {
    const w = window as any;
    w.__disk = d;
    w.__saveDisk();
  }, disk);
}

/** Remove one path, as an external delete would. */
async function deleteOnDisk(page: Page, p: string) {
  await page.evaluate((path) => {
    const w = window as any;
    delete w.__disk[path];
    w.__saveDisk();
  }, p);
}

/** Overwrite a path with different bytes and a newer mtime. */
async function editOnDisk(page: Page, p: string, bytes: number[]) {
  await page.evaluate(
    ({ path, b }) => {
      const w = window as any;
      w.__disk[path] = { bytes: b, modifiedMs: 1_800_000_000_000 };
      w.__saveDisk();
    },
    { path: p, b: bytes },
  );
}

async function emitWatch(page: Page, paths: string[]) {
  await page.evaluate((p) => (window as any).__emitDisk(p), paths);
}

/** Write file records straight into IndexedDB, as an earlier session would. */
async function seedFiles(page: Page, files: SeedFile[]) {
  await page.evaluate(async (seed: SeedFile[]) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("stirling-pdf-files", 9);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(["files"], "readwrite");
    const store = tx.objectStore("files");
    store.clear();
    for (const f of seed) {
      const bytes = new Uint8Array(f.bytes);
      const baseline = f.baseline ?? {
        size: bytes.length,
        modifiedMs: (window as any).__disk[f.path]?.modifiedMs ?? 0,
      };
      store.put({
        id: f.id,
        fileId: f.id,
        name: f.name,
        type: "application/pdf",
        size: bytes.length,
        lastModified: baseline.modifiedMs,
        createdAt: Date.now(),
        data: new Blob([bytes], { type: "application/pdf" }),
        quickKey: `${f.name}|${bytes.length}|${baseline.modifiedMs}`,
        isLeaf: true,
        versionNumber: 1,
        originalFileId: f.id,
        toolHistory: [],
        localFilePath: f.path,
        diskSyncedSize: baseline.size,
        diskSyncedModifiedMs: baseline.modifiedMs,
        isDirty: f.isDirty ?? undefined,
      });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, files);
}

/** The desktop profile opens onto a welcome carousel and a sign-in prompt. */
async function dismissModals(page: Page) {
  for (let i = 0; i < 6; i++) {
    const close = page.locator('[aria-label="Close"]:visible').first();
    if ((await close.count()) === 0) break;
    await close.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  // Deliberately no Escape here: it backs the file manager out to the editor,
  // which silently moved every later scenario off the file list.
  await page.waitForTimeout(300);
}

async function shoot(page: Page, name: string, theme: string) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}_${theme}.png`) });
  console.log(`  shot ${name}_${theme}`);
}

/** Double-click a card into the workbench and wait for the open to finish -
 *  capturing mid-flight shows an empty workbench. */
async function openCard(page: Page, name: string) {
  // Scope to the grid card: a bare text match also hits the library rail on the
  // left, which navigates without loading the file into the workbench.
  const card = page
    .locator(".files-page-card", { hasText: name.replace(/\.pdf$/, "") })
    .first();
  await card.scrollIntoViewIfNeeded();
  await card.dblclick();
  // Wait for the workbench to actually take the file, not just for the route to
  // change - otherwise the capture can fire on an empty workbench.
  await page
    .getByRole("button", { name: /Open Files/i })
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => {});
  // And for the document itself to render - a re-read from disk re-parses the
  // file, so the viewer sits on "Loading tool…" well after the toast has fired.
  await page
    .getByText(/Loading tool/i)
    .waitFor({ state: "detached", timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
}

async function gotoFiles(page: Page) {
  await page.goto("/files");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
}

/** Stage disk contents and stored records, then navigate so the app re-reads
 *  IndexedDB cold. Always ends on the file list with onboarding dismissed. */
async function stage(
  page: Page,
  disk: Record<string, DiskEntry>,
  files: SeedFile[],
) {
  await setDisk(page, disk);
  await seedFiles(page, files);
  await gotoFiles(page);
  await dismissModals(page);
  await page.waitForTimeout(1200);
}

const ALL_PRESENT: Record<string, DiskEntry> = {
  [P.report]: { bytes: PDF_SMALL, modifiedMs: MTIME },
  [P.notes]: { bytes: PDF_SMALL, modifiedMs: MTIME },
  [P.archived]: { bytes: PDF_SMALL, modifiedMs: MTIME },
};

const THREE_FILES: SeedFile[] = [
  {
    id: "f-report",
    name: "quarterly-report.pdf",
    path: P.report,
    bytes: PDF_SMALL,
  },
  { id: "f-notes", name: "notes.pdf", path: P.notes, bytes: PDF_SMALL },
  {
    id: "f-archived",
    name: "archived.pdf",
    path: P.archived,
    bytes: PDF_SMALL,
  },
];

test.use({ autoGoto: false, viewport: { width: 2076, height: 1096 } });
test.describe.configure({ mode: "serial", timeout: 240_000 });

// A capture run, not a gate: it needs a desktop-mode dev server and takes
// minutes, so it stays out of the way unless someone asks for the shots.
test.skip(!SHOT_DIR, "set SHOT_DIR to regenerate the walkthrough screenshots");

for (const theme of ["light", "dark"] as const) {
  test(`capture disk-link states (${theme})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: theme });
    await installTauri(page);

    // ---- 1. everything in sync -------------------------------------------
    await gotoFiles(page);
    await stage(page, ALL_PRESENT, THREE_FILES);
    await shoot(page, "01_in_sync", theme);

    // ---- 3. deleted while the app was closed ------------------------------
    // (before 2, because 2 leaves the workbench populated)
    const withoutArchived = { ...ALL_PRESENT };
    delete withoutArchived[P.archived];
    await stage(page, withoutArchived, THREE_FILES);
    await shoot(page, "03_pruned_after_delete", theme);

    // ---- 2. edited in another app ----------------------------------------
    await stage(page, ALL_PRESENT, THREE_FILES);
    await editOnDisk(page, P.report, PDF_LARGE);
    await openCard(page, "quarterly-report.pdf");
    await page.waitForTimeout(2500);
    await shoot(page, "02_external_edit_picked_up", theme);

    // ---- 4. deleted between listing and clicking --------------------------
    await stage(page, ALL_PRESENT, THREE_FILES);
    // The list-time check has already passed; now it goes.
    await deleteOnDisk(page, P.notes);
    await openCard(page, "notes.pdf");
    await page.waitForTimeout(2000);
    await shoot(page, "04_vanished_on_open", theme);

    // ---- 5. deleted while open, caught live by the watcher ----------------
    await stage(page, ALL_PRESENT, THREE_FILES);
    await openCard(page, "archived.pdf");
    await page.waitForTimeout(1500);
    await deleteOnDisk(page, P.archived);
    await emitWatch(page, [P.archived]);
    await page.waitForTimeout(2500);
    await shoot(page, "05_open_file_deleted", theme);

    // The badge outlives the toast - go back to the list and show it.
    await gotoFiles(page);
    await page.waitForTimeout(2000);
    await shoot(page, "05b_orphaned_badge", theme);

    // ---- 6. disk moved on while unsaved edits were held -------------------
    await stage(page, ALL_PRESENT, [
      { ...THREE_FILES[0], isDirty: true },
      THREE_FILES[1],
      THREE_FILES[2],
    ]);
    await editOnDisk(page, P.report, PDF_LARGE);
    await openCard(page, "quarterly-report.pdf");
    await page.waitForTimeout(2500);
    await shoot(page, "06_conflict", theme);

    await gotoFiles(page);
    await page.waitForTimeout(2000);
    await shoot(page, "06b_conflict_badge", theme);
  });
}
