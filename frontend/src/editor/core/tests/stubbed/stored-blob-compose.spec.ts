import path from "node:path";
import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { DATABASE_CONFIGS } from "@app/services/indexedDBManager";

/**
 * A Blob read back from IndexedDB must be read, never built over: Chromium can
 * drop its registration while the page still holds it, and then kills the
 * renderer for any Blob that references it (crbug.com/392376370). The kill
 * needs a race, so this checks the precondition instead: nothing slices, wraps
 * or posts a stored Blob.
 */

const PDF = readFileSync(
  path.join(import.meta.dirname, "../test-fixtures/sample.pdf"),
);
const RECORD_COUNT = 24;
const RENAMED_NAME = "renamed.pdf";
const DUPLICATED_NAME = "stored-3.pdf";
const THUMBNAIL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface Composition {
  op: string;
  stack: string;
}

/** Tags every Blob that comes out of IndexedDB, and records each Blob built
 *  over a tagged one. Runs before the app so it sees every read. */
async function watchStoredBlobs(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = new WeakSet<Blob>();
    const formsWithStored = new WeakSet<FormData>();
    const compositions: { op: string; stack: string }[] = [];
    (
      window as unknown as { __storedBlobCompositions: typeof compositions }
    ).__storedBlobCompositions = compositions;

    const NativeBlob = Blob;
    const tag = (value: unknown): void => {
      if (value instanceof NativeBlob) stored.add(value);
      else if (Array.isArray(value)) value.forEach(tag);
      else if (value && typeof value === "object") {
        const data = (value as { data?: unknown }).data;
        if (data instanceof NativeBlob) stored.add(data);
      }
    };
    const note = (op: string): void => {
      const stack = (new Error().stack ?? "").split("\n").slice(2, 7);
      compositions.push({ op, stack: stack.join(" | ") });
    };
    const hasStored = (parts: unknown): boolean =>
      Array.isArray(parts) &&
      parts.some((part) => part instanceof NativeBlob && stored.has(part));

    for (const [proto, prop] of [
      [IDBRequest.prototype, "result"],
      [IDBCursorWithValue.prototype, "value"],
    ] as const) {
      const native = Object.getOwnPropertyDescriptor(proto, prop);
      if (!native?.get) continue;
      const read = native.get;
      Object.defineProperty(proto, prop, {
        ...native,
        get(this: unknown) {
          const value = read.call(this);
          tag(value);
          return value;
        },
      });
    }

    const nativeSlice = NativeBlob.prototype.slice;
    NativeBlob.prototype.slice = function (
      this: Blob,
      ...args: Parameters<Blob["slice"]>
    ) {
      if (stored.has(this)) note("slice");
      return nativeSlice.apply(this, args);
    };

    for (const method of ["append", "set"] as const) {
      const native = FormData.prototype[method];
      FormData.prototype[method] = function (
        this: FormData,
        ...args: unknown[]
      ) {
        if (args[1] instanceof NativeBlob && stored.has(args[1])) {
          formsWithStored.add(this);
        }
        return (native as (...a: unknown[]) => void).apply(this, args);
      } as FormData["append"];
    }
    const postsStored = (body: unknown): boolean =>
      body instanceof FormData && formsWithStored.has(body);

    window.Blob = new Proxy(NativeBlob, {
      construct(target, args, newTarget) {
        if (hasStored(args[0])) note("new Blob");
        return Reflect.construct(target, args, newTarget);
      },
    });
    window.File = new Proxy(File, {
      construct(target, args, newTarget) {
        if (hasStored(args[0])) note("new File");
        return Reflect.construct(target, args, newTarget);
      },
    });
    window.Request = new Proxy(Request, {
      construct(target, args, newTarget) {
        if (postsStored((args[1] as RequestInit | undefined)?.body)) {
          note("new Request(FormData)");
        }
        return Reflect.construct(target, args, newTarget);
      },
    });
    window.Response = new Proxy(Response, {
      construct(target, args, newTarget) {
        if (postsStored(args[0])) note("new Response(FormData)");
        return Reflect.construct(target, args, newTarget);
      },
    });
    const nativeFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (postsStored(init?.body)) note("fetch(FormData)");
      return nativeFetch.call(window, input, init);
    };
  });
}

/** One seed per tab: half the records have a cached thumbnail, and the first
 *  one's File still carries its pre-rename name. */
async function seedStoredFiles(page: Page): Promise<void> {
  await page.addInitScript(
    ({ bytes, count, renamedName, thumbnail, schema }) => {
      if (sessionStorage.getItem("stored-blob-seeded")) return;
      sessionStorage.setItem("stored-blob-seeded", "1");
      const pdf = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0));
      const open = indexedDB.open(schema.name, schema.version);
      // The app's own schema, so every index it queries exists.
      open.onupgradeneeded = () => {
        const db = open.result;
        for (const config of schema.stores) {
          if (db.objectStoreNames.contains(config.name)) continue;
          const store = db.createObjectStore(config.name, {
            keyPath: config.keyPath,
            autoIncrement: config.autoIncrement,
          });
          for (const index of config.indexes ?? []) {
            store.createIndex(index.name, index.keyPath, {
              unique: index.unique,
            });
          }
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        const tx = db.transaction(["files"], "readwrite");
        const store = tx.objectStore("files");
        const now = Date.now();
        for (let i = 0; i < count; i++) {
          const id = `stored-${i}`;
          const name = i === 0 ? renamedName : `${id}.pdf`;
          const withThumbnail = i % 2 === 1;
          const record = {
            id,
            fileId: id,
            quickKey: `${name}|${pdf.length}|${now}`,
            name,
            type: "application/pdf",
            size: pdf.length,
            lastModified: now,
            createdAt: now - i,
            data: new File([pdf], i === 0 ? "before-rename.pdf" : name, {
              type: "application/pdf",
              lastModified: now,
            }),
            thumbnail: withThumbnail ? thumbnail : undefined,
            thumbnailStoredAt: withThumbnail ? now : undefined,
            isLeaf: true,
            versionNumber: 1,
            originalFileId: id,
            parentFileId: null,
            toolHistory: [],
            folderId: null,
            remoteStorageId: null,
          };
          // An engine that refuses Blob values stores copies, as the app does.
          store.put(record).onerror = (event) => {
            event.preventDefault();
            sessionStorage.setItem("stored-blob-refused", "1");
            store.put({ ...record, data: pdf.buffer.slice(0) });
          };
        }
        tx.oncomplete = () => db.close();
      };
    },
    {
      bytes: PDF.toString("base64"),
      count: RECORD_COUNT,
      renamedName: RENAMED_NAME,
      thumbnail: THUMBNAIL,
      schema: DATABASE_CONFIGS.FILES,
    },
  );
}

async function stubLibraryApis(page: Page): Promise<void> {
  const config = { appVersion: "test", storageEnabled: true };
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({ json: config }),
  );
  await page.route("**/api/v1/storage/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
}

function card(page: Page, name: string) {
  return page
    .locator(".files-page-card:not(.is-folder)")
    .filter({ hasText: name });
}

async function compositions(page: Page): Promise<Composition[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __storedBlobCompositions: Composition[] })
        .__storedBlobCompositions,
  );
}

test.describe("Blobs read back from IndexedDB", () => {
  test.use({ autoGoto: false, filesViewMode: "grid" });

  test.beforeEach(async ({ page }) => {
    await stubLibraryApis(page);
    await watchStoredBlobs(page);
    await seedStoredFiles(page);
  });

  test("are read, never sliced, wrapped or posted", async ({ page }) => {
    await page.goto("/files?view=recent", { waitUntil: "domcontentloaded" });
    await expect(card(page, DUPLICATED_NAME)).toBeVisible({ timeout: 15_000 });
    test.skip(
      await page.evaluate(
        () => sessionStorage.getItem("stored-blob-refused") === "1",
      ),
      "this engine keeps no Blob values in IndexedDB, so there is none to compose over",
    );

    // A record whose stored File no longer matches its name.
    await card(page, RENAMED_NAME).dblclick();
    await expect(page).not.toHaveURL(/\/files/, { timeout: 10_000 });
    await expect(
      page.locator(".file-sidebar-file-item").filter({ hasText: RENAMED_NAME }),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/files?view=recent", { waitUntil: "domcontentloaded" });
    await card(page, DUPLICATED_NAME)
      .getByRole("button", { name: /File actions/i })
      .click();
    await page.getByTestId("file-menu-duplicate").click();
    await expect(card(page, "stored-3 (copy).pdf")).toBeVisible({
      timeout: 10_000,
    });

    // Thumbnails and audits run in the background; give them a pass to finish.
    await page.waitForTimeout(3_000);
    const found = await compositions(page);
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });
});
