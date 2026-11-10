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

async function openReport(
  page: Page,
  { isDirty, saveMode }: { isDirty: boolean; saveMode?: string },
) {
  await installTauri(page);
  if (saveMode)
    await page.addInitScript((mode) => {
      localStorage.setItem(
        "stirlingpdf_preferences",
        JSON.stringify({ saveMode: mode }),
      );
    }, saveMode);
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

async function viewerReady(page: Page) {
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await firstPage.hover();
}

async function compressOpenFile(page: Page) {
  await page.route("**/api/v1/config/app-config", (route) =>
    route.fulfill({ json: { enableLogin: false, dependenciesReady: true } }),
  );
  await page.route("**/api/v1/config/endpoints-availability?*", (route) => {
    const keys =
      new URL(route.request().url()).searchParams
        .get("endpoints")
        ?.split(",") ?? [];
    return route.fulfill({
      json: Object.fromEntries(keys.map((key) => [key, { enabled: true }])),
    });
  });
  await page.route("**/api/v1/misc/compress-pdf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: Buffer.from(PDF),
    }),
  );
  await page
    .getByRole("link", { name: "Compress", exact: true })
    .first()
    .click();
  const run = page.locator('[data-tour="run-button"]');
  await expect(run).toBeEnabled({ timeout: 20_000 });
  await run.click();
  const save = page.getByTestId("download-result-button");
  await expect(save).toBeVisible({ timeout: 30_000 });
  return save;
}

test.describe("Saving files that live on disk", () => {
  test("the toolbar marks unsaved disk edits and Ctrl+S saves in place", async ({
    page,
  }) => {
    await openReport(page, { isDirty: true });

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeVisible({ timeout: 20_000 });
    await expect(save.locator(".workbench-bar-unsaved-dot")).toBeVisible();

    await viewerReady(page);
    await page.keyboard.press("Control+s");
    await expect.poll(() => written(page)).toContain(REPORT);
    await expect
      .poll(() => savedLeaves(page))
      .toEqual([{ dirty: false, matchesDisk: true }]);
    await expect(save.locator(".workbench-bar-unsaved-dot")).toHaveCount(0);
  });

  test("the viewer's Save writes the stored version in place", async ({
    page,
  }) => {
    await openReport(page, { isDirty: true });

    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage).toBeVisible({ timeout: 30_000 });
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect.poll(() => written(page)).toContain(REPORT);
    await expect
      .poll(() => savedLeaves(page))
      .toEqual([{ dirty: false, matchesDisk: true }]);
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

  test("Save a copy writes one copy beside the file and keeps it as the home", async ({
    page,
  }) => {
    await openReport(page, { isDirty: true, saveMode: "copy" });
    await viewerReady(page);
    const copy = "C:/Docs/quarterly-report (edited).pdf";

    await page.keyboard.press("Control+s");
    await expect.poll(() => written(page)).toContain(copy);
    expect(await written(page)).not.toContain(REPORT);
    await expect
      .poll(async () => (await savedLeaves(page)).map((leaf) => leaf.dirty))
      .toEqual([false]);

    await page.keyboard.press("Control+s");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(await written(page)).toEqual([copy]);

    // The copy's name is stored, so it is still there after a restart.
    await page.reload();
    await expect(
      page.getByText("quarterly-report (edited).pdf").first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", {
        name: "quarterly-report (edited).pdf",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("Ask each time offers update, copy or elsewhere before saving", async ({
    page,
  }) => {
    await openReport(page, { isDirty: true, saveMode: "ask" });
    await viewerReady(page);

    await page.keyboard.press("Control+s");
    const dialog = page.getByRole("dialog", {
      name: 'Save "quarterly-report.pdf"',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Save a copy somewhere else…")).toBeVisible();
    await dialog.getByText("Save a copy next to it").click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() => written(page))
      .toContain("C:/Docs/quarterly-report (edited).pdf");
  });

  test("a tool result's Save follows the save mode", async ({ page }) => {
    await openReport(page, { isDirty: true, saveMode: "copy" });

    const save = await compressOpenFile(page);
    await expect(save).toHaveText("Save a copy next to it");
    await save.click();
    await expect
      .poll(() => written(page))
      .toContain("C:/Docs/quarterly-report (edited).pdf");
    expect(await written(page)).not.toContain(REPORT);
  });

  test("a tool result's Save asks first in Ask each time mode", async ({
    page,
  }) => {
    await openReport(page, { isDirty: true, saveMode: "ask" });

    await (await compressOpenFile(page)).click();
    await expect(
      page.getByRole("dialog", { name: 'Save "quarterly-report.pdf"' }),
    ).toBeVisible();
    expect(await written(page)).toEqual([]);
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
