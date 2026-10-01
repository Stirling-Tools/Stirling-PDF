import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import {
  installTauri,
  dismissModals,
  setDisk,
} from "@app/tests/helpers/tauriDiskStub";

const PATH = "C:/Docs/report.pdf";
const BYTES = Array.from(
  fs.readFileSync(
    path.resolve("src/core/tests/test-fixtures/annotation-text-sample.pdf"),
  ),
);
const MTIME = 1_700_000_000_000;

test.use({ autoGoto: false });

async function storedLinks(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open("stirling-pdf-files");
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("files")) {
            db.close();
            resolve([]);
            return;
          }
          const read = db.transaction("files").objectStore("files").getAll();
          read.onsuccess = () => {
            resolve(
              read.result.map(({ name, localFilePath, diskSyncedSize }) => ({
                name,
                localFilePath,
                diskSyncedSize,
              })),
            );
            db.close();
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

async function expectLinked(page: Page) {
  await expect
    .poll(() => storedLinks(page))
    .toEqual([
      { name: "report.pdf", localFilePath: PATH, diskSyncedSize: BYTES.length },
    ]);
}

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto("/editor");
  await dismissModals(page);
  await setDisk(page, { [PATH]: { bytes: BYTES, modifiedMs: MTIME } });
  await page.evaluate((path) => {
    Object.assign(window, { __pickedPaths: [path], __droppedPaths: [path] });
  }, PATH);
});

test("the sidebar native picker keeps its path after reload and saves in place", async ({
  page,
}) => {
  await page.getByTestId("files-button").click();
  await expectLinked(page);
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1);
  await page.reload();
  await dismissModals(page);
  await expectLinked(page);
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1);
  await page.locator(".file-sidebar-file-item").click();
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "__writtenPaths")))
    .toEqual([PATH]);
});

test("the Files page upload uses the native picker", async ({ page }) => {
  await page.getByTestId("my-files-button").click();
  await page
    .getByRole("button", { name: "Upload files", exact: true })
    .first()
    .click();
  await expectLinked(page);
});

test("the sidebar add button uses the native picker", async ({ page }) => {
  await page.getByTestId("pdf-library-add-files").click();
  await expectLinked(page);
});

test("a Finder-open event stores the link during import", async ({ page }) => {
  await page.evaluate((path) => {
    Reflect.set(window, "__openedPaths", [path]);
    const callbacks = Reflect.get(window, "__callbacks");
    const listeners = Reflect.get(window, "__listeners");
    callbacks[listeners["files-changed"]]({
      event: "files-changed",
      payload: null,
    });
  }, PATH);
  await expectLinked(page);
});

test("an HTML file drop imports the native path", async ({ page }) => {
  await page.locator(".file-sidebar").evaluate(
    (node, { bytes, mtime }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File([new Uint8Array(bytes)], "report.pdf", {
          type: "application/pdf",
          lastModified: mtime,
        }),
      );
      node.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    { bytes: BYTES, mtime: MTIME },
  );
  await expectLinked(page);
});
