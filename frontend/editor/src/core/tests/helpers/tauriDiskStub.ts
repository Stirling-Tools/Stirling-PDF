// oxlint-disable typescript/no-explicit-any -- impersonates Tauri's untyped
// `__TAURI_INTERNALS__` bridge; typing it would re-declare Tauri's private IPC.
import type { Page } from "@playwright/test";

// Runs the real desktop build against an in-memory disk the test mutates
// between steps, so the disk-link paths execute for real without a Tauri
// process. Requires `vite --mode desktop`, or desktopFileLinkingSupported is
// false and every helper here is a no-op the app never consults.

export type DiskEntry = { bytes: number[]; modifiedMs: number };
export type SeedFile = {
  id: string;
  name: string;
  path: string;
  bytes: number[];
  baseline?: { size: number; modifiedMs: number };
  isDirty?: boolean;
  /** false seeds a superseded version, as a tool run leaves its input. */
  isLeaf?: boolean;
  versionNumber?: number;
  originalFileId?: string;
  parentFileId?: string;
};

/** Fake Tauri IPC over an in-memory disk the test mutates between steps. */

export async function installTauri(page: Page) {
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
        ? {
            availability: "present",
            size: e.bytes.length,
            modifiedMs: e.modifiedMs,
          }
        : { availability: "gone" };
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

export async function setDisk(page: Page, disk: Record<string, DiskEntry>) {
  await page.evaluate((d) => {
    const w = window as any;
    w.__disk = d;
    w.__saveDisk();
  }, disk);
}

/** Remove one path, as an external delete would. */
export async function deleteOnDisk(page: Page, p: string) {
  await page.evaluate((path) => {
    const w = window as any;
    delete w.__disk[path];
    w.__saveDisk();
  }, p);
}

/** Overwrite a path with different bytes and a newer mtime. */
export async function editOnDisk(page: Page, p: string, bytes: number[]) {
  await page.evaluate(
    ({ path, b }) => {
      const w = window as any;
      w.__disk[path] = { bytes: b, modifiedMs: 1_800_000_000_000 };
      w.__saveDisk();
    },
    { path: p, b: bytes },
  );
}

export async function emitWatch(page: Page, paths: string[]) {
  await page.evaluate((p) => (window as any).__emitDisk(p), paths);
}

/** Write file records straight into IndexedDB, as an earlier session would. */
export async function seedFiles(page: Page, files: SeedFile[]) {
  await page.evaluate(async (seed: SeedFile[]) => {
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("stirling-pdf-files");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(req.error ?? new Error("indexedDB.open failed"));
      });
    let db: IDBDatabase = await open();
    for (let i = 0; i < 100 && !db.objectStoreNames.contains("files"); i++) {
      db.close();
      await new Promise((r) => setTimeout(r, 100));
      db = await open();
    }
    if (!db.objectStoreNames.contains("files")) {
      throw new Error("the app never created the files store");
    }
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
        data: bytes.buffer,
        quickKey: `${f.name}|${bytes.length}|${baseline.modifiedMs}`,
        isLeaf: f.isLeaf ?? true,
        versionNumber: f.versionNumber ?? 1,
        originalFileId: f.originalFileId ?? f.id,
        parentFileId: f.parentFileId,
        toolHistory: [],
        localFilePath: f.path,
        diskSyncedSize: baseline.size,
        diskSyncedModifiedMs: baseline.modifiedMs,
        isDirty: f.isDirty ?? undefined,
      });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(null);
      const fail = (what: string) => () =>
        reject(
          new Error(
            `${what}: ${tx.error?.name ?? "no error"} ${tx.error?.message ?? ""}`,
          ),
        );
      tx.onerror = fail("transaction failed");
      tx.onabort = fail("transaction aborted");
    });
    db.close();
  }, files);
}

/** The desktop profile opens onto a welcome carousel and a sign-in prompt. */

export async function dismissModals(page: Page) {
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

export async function openCard(page: Page, name: string) {
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

export async function gotoFiles(page: Page) {
  await page.goto("/files");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
}

/** Stage disk contents and stored records, then navigate so the app re-reads
 *  IndexedDB cold. Always ends on the file list with onboarding dismissed. */
export async function stage(
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
