import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import {
  type DiskEntry,
  type SeedFile,
  installTauri,
  dismissModals,
  editOnDisk,
  emitWatch,
  gotoFiles,
  openCard,
  stage,
} from "@app/tests/helpers/tauriDiskStub";
import fs from "node:fs";
import path from "node:path";

// The three ways an external edit could still cost the user work, driven through
// the real desktop build rather than asserted on the units underneath it.
// Needs `vite --mode desktop`: on any other build desktopFileLinkingSupported is
// false, nothing reconciles, and every case below passes for the wrong reason.

const FIXTURES = path.resolve("src/core/tests/test-fixtures");
// One page vs eight: the viewer's own page DOM is then the assertion, and a
// stale document cannot fake it the way a byte count or a blob URL can.
const PDF_1_PAGE = Array.from(
  fs.readFileSync(path.join(FIXTURES, "annotation-text-sample.pdf")),
);
const PDF_8_PAGES = Array.from(
  fs.readFileSync(path.join(FIXTURES, "many-pages-sample.pdf")),
);

const MTIME = 1_700_000_000_000;
const REPORT = "C:/Docs/quarterly-report.pdf";

const onDisk = (): Record<string, DiskEntry> => ({
  [REPORT]: { bytes: PDF_1_PAGE, modifiedMs: MTIME },
});

const report = (over: Partial<SeedFile> = {}): SeedFile => ({
  id: "f-report",
  name: "quarterly-report.pdf",
  path: REPORT,
  bytes: PDF_1_PAGE,
  ...over,
});

/** The viewer's own page count. Not the mounted [data-page-index] elements:
 *  the viewer virtualises, so those count what is scrolled into view. */
function viewerPageCount(page: Page, pages: number) {
  return page.getByText(`/ ${pages}`, { exact: true });
}

test.use({ autoGoto: false, viewport: { width: 2076, height: 1096 } });

/** The welcome carousel's close button carries no aria-label, so the shared
 *  dismissal walks past it and its overlay then eats every card click. Scoped to
 *  the dialog so it cannot reach the window chrome's Close, which shares a name.
 *  The conflict modal is deliberately close-button-less, so this never eats it. */
async function dismissOnboarding(page: Page) {
  for (let i = 0; i < 6; i++) {
    const close = page
      .getByRole("dialog")
      .getByRole("button", { name: "Close" })
      .first();
    if ((await close.count()) === 0) break;
    await close.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("an external edit never silently costs the user work", () => {
  test("a reload under an open viewer replaces what is on screen", async ({
    page,
  }) => {
    await installTauri(page);
    await gotoFiles(page);
    await stage(page, onDisk(), [report()]);
    await dismissModals(page);
    await dismissOnboarding(page);
    await openCard(page, "quarterly-report.pdf");

    await expect(viewerPageCount(page, 1)).toBeVisible({ timeout: 30_000 });

    // Deliberately without navigating away: re-opening from the file list
    // remounts the viewer and rebuilds its blob URL either way, hiding the bug.
    // This is the live path - the file stays open and the watcher fires.
    await editOnDisk(page, REPORT, PDF_8_PAGES);
    await emitWatch(page, [REPORT]);

    await expect(page.getByText(/Updated from disk/i).first()).toBeVisible({
      timeout: 20_000,
    });
    // The bug this pins: the toast fired while the viewer kept the old document,
    // so it went on rendering one page of bytes nobody had any more.
    await expect(viewerPageCount(page, 8)).toBeVisible({ timeout: 20_000 });
  });

  test("an open page editor's edits are offered as a choice, not overwritten", async ({
    page,
  }) => {
    await installTauri(page);
    await gotoFiles(page);
    await stage(page, onDisk(), [report()]);
    await dismissModals(page);
    await dismissOnboarding(page);
    await openCard(page, "quarterly-report.pdf");

    await page.getByText("PDF Multi Tool", { exact: true }).first().click();
    const firstPage = page.locator("[data-page-id]").first();
    await firstPage.waitFor({ state: "visible", timeout: 30_000 });
    await firstPage.hover();
    await firstPage.getByRole("button", { name: "Rotate Right" }).click();

    // Nothing has committed a version, so the stub is still clean. Before the
    // fix that was the only dirty signal reconciliation looked at.
    await editOnDisk(page, REPORT, PDF_8_PAGES);
    await emitWatch(page, [REPORT]);

    await expect(
      page.getByRole("button", { name: /Keep my changes/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Updated from disk/i)).toHaveCount(0);
  });

  test("an earlier version opens as itself, not as today's file", async ({
    page,
  }) => {
    await installTauri(page);
    await gotoFiles(page);
    // A tool ran and its output was saved over the path, so v2 is the leaf and
    // v1 keeps a baseline describing the file as it was when v1 was current.
    await stage(page, onDisk(), [
      report({ id: "f-v1", isLeaf: false, versionNumber: 1 }),
      report({
        id: "f-v2",
        isLeaf: true,
        versionNumber: 2,
        parentFileId: "f-v1",
        originalFileId: "f-v1",
      }),
    ]);
    await dismissModals(page);
    await dismissOnboarding(page);
    await editOnDisk(page, REPORT, PDF_8_PAGES);

    const card = page.locator(".files-page-card").first();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: /File actions/i }).click();
    await page
      .getByText(/Version history/i)
      .first()
      .click();
    await page
      .getByRole("button", { name: /Version actions/i })
      .first()
      .click();
    await page
      .getByText(/Open in workspace/i)
      .first()
      .click();

    // "Open in workspace" lands in the file editor, so the card's own size is
    // what the version opened as: 2.07 KB is v1, 4.04 KB is today's disk file.
    const opened = page.getByRole("listitem").filter({
      hasText: "quarterly-report.pdf",
    });
    await expect(opened).toBeVisible({ timeout: 30_000 });
    // Reconciliation is the first thing hydration does, so anything it was
    // going to replace has been replaced by the time the card settles.
    await page.waitForTimeout(4000);
    await expect(opened).toContainText("2.07 KB");
    await expect(page.getByText(/Updated from disk/i)).toHaveCount(0);

    const storedSize = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("stirling-pdf-files");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const record = await new Promise<{ size?: number } | undefined>(
        (resolve, reject) => {
          const req = db
            .transaction(["files"], "readonly")
            .objectStore("files")
            .get("f-v1");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        },
      );
      db.close();
      return record?.size ?? null;
    });
    // The data loss this pins: reconciliation reloaded the path and wrote
    // today's bytes over the only copy that version had.
    expect(storedSize).toBe(PDF_1_PAGE.length);
  });
});
