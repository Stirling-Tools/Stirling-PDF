import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { readFileSync } from "node:fs";
import path from "node:path";

const fixture = path.join(
  import.meta.dirname,
  "../test-fixtures/table-sample.pdf",
);
const corpus: string[] = process.env.PDF_TABLE_CORPUS
  ? JSON.parse(readFileSync(process.env.PDF_TABLE_CORPUS, "utf8"))
  : [];

test.use({ autoGoto: false });

for (const file of [fixture, ...corpus]) {
  test(`table editing survives Done, undo and export: ${path.basename(file)}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible();
    await page.getByTestId("pdf-editor-file-input").setInputFiles(file);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForFunction(() => {
      const store = (window as unknown as { __editor_store: EditorStore })
        .__editor_store;
      return store.getState().firstPageRendered && !store.getState().loading;
    });
    const contentBefore = await page.evaluate(() => {
      const store = (window as unknown as { __editor_store: EditorStore })
        .__editor_store;
      return store.getState().pages.map((p) => ({
        pageIndex: p.pageIndex,
        text: p.runs
          .map((r) => r.text)
          .join("")
          .replace(/\s/g, "")
          .split("")
          .sort()
          .join(""),
      }));
    });
    const chips = page.locator(
      '[data-testid^="pdf-editor-recognized-table-edit-"]',
    );
    const detected = await chips.count();
    await testInfo.attach("detection", {
      body: JSON.stringify({ file, detected }),
      contentType: "application/json",
    });
    if (detected === 0) {
      expect(errors).toEqual([]);
      return;
    }
    await chips.first().click();
    const before = await page.evaluate(() => {
      const store = (window as unknown as { __editor_store: EditorStore })
        .__editor_store;
      const table = store.getState().pages.find((p) => p.tables?.length)
        ?.tables?.[0];
      if (!table) throw new Error("Table adoption failed");
      return {
        id: table.id,
        rows: table.rows,
        cols: table.cols,
        pageIndex: table.pageIndex,
      };
    });
    await page.getByTestId(`pdf-editor-table-add-row-${before.id}`).click();
    await page.getByTestId(`pdf-editor-table-done-${before.id}`).click();
    await expect(page.getByTestId(`pdf-editor-table-${before.id}`)).toHaveCount(
      0,
    );
    await page.keyboard.press("Control+z");
    const undone = await page.evaluate(
      ({ pageIndex, id }) => {
        const store = (window as unknown as { __editor_store: EditorStore })
          .__editor_store;
        return store.document?.page(pageIndex).tables.find((t) => t.id === id)
          ?.rows;
      },
      { pageIndex: before.pageIndex, id: before.id },
    );
    expect(undone).toBe(before.rows);
    await page.keyboard.press("Control+y");
    const redone = await page.evaluate(
      ({ pageIndex, id }) => {
        const store = (window as unknown as { __editor_store: EditorStore })
          .__editor_store;
        return store.document?.page(pageIndex).tables.find((t) => t.id === id)
          ?.rows;
      },
      { pageIndex: before.pageIndex, id: before.id },
    );
    expect(redone).toBe(before.rows + 1);
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    const download = await downloadPromise;
    const saved = testInfo.outputPath("edited.pdf");
    await download.saveAs(saved);
    await testInfo.attach("edited PDF", {
      path: saved,
      contentType: "application/pdf",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("pdf-editor-file-input").setInputFiles(saved);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForFunction(() => {
      const store = (window as unknown as { __editor_store: EditorStore })
        .__editor_store;
      return store.getState().firstPageRendered && !store.getState().loading;
    });
    const contentAfter = await page.evaluate(() => {
      const store = (window as unknown as { __editor_store: EditorStore })
        .__editor_store;
      return store.getState().pages.map((p) => ({
        pageIndex: p.pageIndex,
        text: p.runs
          .map((r) => r.text)
          .join("")
          .replace(/\s/g, "")
          .split("")
          .sort()
          .join(""),
      }));
    });
    expect(contentAfter).toEqual(contentBefore);
    await expect(page.getByTestId("pdf-editor-error")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("reopened.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
