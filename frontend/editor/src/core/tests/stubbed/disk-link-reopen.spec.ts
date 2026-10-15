import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import {
  installTauri,
  dismissModals,
  setDisk,
} from "@app/tests/helpers/tauriDiskStub";

/** What opening a file from Explorer stores. Opening one again used to store
 *  another full copy of it every time, so the library grew by one duplicate
 *  per double-click. */

const PATH = "C:/Docs/report.pdf";
const BYTES = Array.from(
  fs.readFileSync(
    path.resolve("src/core/tests/test-fixtures/annotation-text-sample.pdf"),
  ),
);
const MTIME = 1_700_000_000_000;

test.use({ autoGoto: false });

async function storedCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("stirling-pdf-files");
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("files")) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction("files").objectStore("files").count();
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
          count.onerror = () => {
            db.close();
            reject(count.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

/** What the Rust side does on a file-association open. */
async function openFromExplorer(page: Page, opened = PATH): Promise<void> {
  await page.evaluate((path) => {
    Reflect.set(window, "__openedPaths", [path]);
    const callbacks = Reflect.get(window, "__callbacks");
    const listeners = Reflect.get(window, "__listeners");
    callbacks[listeners["files-changed"]]({
      event: "files-changed",
      payload: null,
    });
  }, opened);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

async function reload(page: Page): Promise<void> {
  await page.reload();
  await dismissModals(page);
}

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto("/editor");
  await dismissModals(page);
  await setDisk(page, { [PATH]: { bytes: BYTES, modifiedMs: MTIME } });
});

test("opening an unchanged file again after a reload stores it once", async ({
  page,
}) => {
  await openFromExplorer(page);
  await expect.poll(() => storedCount(page)).toBe(1);

  await reload(page);
  await openFromExplorer(page);
  // Past the point a second copy would have been written.
  await page.waitForTimeout(1_500);
  expect(await storedCount(page)).toBe(1);
});

test("a file that changed on disk since is stored again", async ({ page }) => {
  await openFromExplorer(page);
  await expect.poll(() => storedCount(page)).toBe(1);

  await setDisk(page, { [PATH]: { bytes: BYTES, modifiedMs: MTIME + 60_000 } });
  await reload(page);
  await openFromExplorer(page);
  await expect.poll(() => storedCount(page)).toBe(2);
});

test("an identical copy in another folder is stored as a file of its own", async ({
  page,
}) => {
  const copy = "C:/Other/report.pdf";
  await setDisk(page, {
    [PATH]: { bytes: BYTES, modifiedMs: MTIME },
    [copy]: { bytes: BYTES, modifiedMs: MTIME },
  });
  await openFromExplorer(page);
  await expect.poll(() => storedCount(page)).toBe(1);

  await openFromExplorer(page, copy);
  await expect.poll(() => storedCount(page)).toBe(2);
});
