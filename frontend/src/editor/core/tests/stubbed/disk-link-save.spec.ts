import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import {
  installTauri,
  gotoFiles,
  openCard,
  stage,
  dismissModals,
} from "@editor/tests/helpers/tauriDiskStub";
import fs from "node:fs";
import path from "node:path";

// Save in the desktop build: the toolbar marks unsaved disk edits, Save As lives
// in "More save options", and Ctrl+S writes the file back in place.
test.use({ filesViewMode: "grid" });

const FIXTURES = path.resolve("src/editor/core/tests/test-fixtures");
const PDF = Array.from(
  fs.readFileSync(path.join(FIXTURES, "annotation-text-sample.pdf")),
);
const REPORT = "C:/Docs/quarterly-report.pdf";
const MTIME = 1_700_000_000_000;

async function requireDiskLinking(page: Page) {
  const invoked = await page.evaluate(
    () => (window as unknown as { __invoked?: string[] }).__invoked ?? [],
  );
  test.skip(
    !invoked.includes("file_disk_state"),
    "needs the desktop build (vite --mode desktop)",
  );
}

const written = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __writtenPaths?: string[] }).__writtenPaths ?? [],
  );

const savedLeaves = (page: Page) =>
  page.evaluate(async (reportPath) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("stirling-pdf-files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const records = await new Promise<
      { isLeaf?: boolean; isDirty?: boolean; size: number }[]
    >((resolve, reject) => {
      const req = db.transaction(["files"]).objectStore("files").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const onDisk = (
      window as unknown as {
        __disk: Record<string, { bytes: number[] } | undefined>;
      }
    ).__disk[reportPath]?.bytes.length;
    return records
      .filter((record) => record.isLeaf !== false)
      .map((record) => ({
        dirty: Boolean(record.isDirty),
        matchesDisk: record.size === onDisk,
      }));
  }, REPORT);

async function openReport(page: Page, { isDirty }: { isDirty: boolean }) {
  await installTauri(page);
  await gotoFiles(page);
  await stage(page, { [REPORT]: { bytes: PDF, modifiedMs: MTIME } }, [
    {
      id: "f-report",
      name: "quarterly-report.pdf",
      path: REPORT,
      bytes: PDF,
      isDirty,
    },
  ]);
  await dismissModals(page);
  await requireDiskLinking(page);
  await openCard(page, "quarterly-report.pdf");
}

test.describe("Saving files that live on disk", () => {
  test("the toolbar marks unsaved disk edits and Ctrl+S saves in place", async ({
    page,
  }) => {
    await openReport(page, { isDirty: true });

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeVisible({ timeout: 20_000 });
    await expect(save.locator(".workbench-bar-unsaved-dot")).toBeVisible();

    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage).toBeVisible({ timeout: 30_000 });
    await firstPage.hover();
    await page.keyboard.press("Control+s");
    await expect.poll(() => written(page)).toContain(REPORT);
    await expect
      .poll(() => savedLeaves(page))
      .toEqual([{ dirty: false, matchesDisk: true }]);
    await expect(save.locator(".workbench-bar-unsaved-dot")).toHaveCount(0);
  });

  test("Ctrl+S with nothing unsaved leaves the file alone", async ({
    page,
  }) => {
    const applies: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("[Viewer] Applying changes"))
        applies.push(message.text());
    });
    await openReport(page, { isDirty: false });

    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage).toBeVisible({ timeout: 30_000 });
    await firstPage.hover();
    await page.keyboard.press("Control+s");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );

    expect(applies).toEqual([]);
    expect(await written(page)).toEqual([]);
    expect(await savedLeaves(page)).toEqual([
      { dirty: false, matchesDisk: true },
    ]);
  });

  test("Save As moves into More save options", async ({ page }) => {
    await openReport(page, { isDirty: true });

    await expect(page.getByRole("button", { name: "Save As" })).toHaveCount(0);
    await page.getByRole("button", { name: "More save options" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Save a copy...", exact: true }),
    ).toBeVisible();
  });

  test("a narrow window marks unsaved disk edits in More actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 740, height: 900 });
    await openReport(page, { isDirty: true });

    const more = page.getByRole("button", { name: "More actions" });
    await expect(more.locator(".workbench-bar-unsaved-dot")).toBeVisible({
      timeout: 20_000,
    });
    const dot = (await more
      .locator(".workbench-bar-unsaved-dot")
      .boundingBox())!;
    const glyph = (await more.locator("svg").boundingBox())!;
    expect(dot.x).toBeLessThan(glyph.x + glyph.width);
    expect(dot.y + dot.height).toBeGreaterThan(glyph.y);
    await more.click();
    await expect(
      page
        .getByRole("menuitem", { name: "Save", exact: true })
        .locator(".workbench-bar-menu-unsaved-dot"),
    ).toBeVisible();
  });
});
