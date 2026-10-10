import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PageRect } from "@app/tools/pdfTextEditor/types";

const fixture = path.join(
  import.meta.dirname,
  "../test-fixtures/table-sample.pdf",
);
const corpus: string[] = process.env.PDF_TABLE_CORPUS
  ? JSON.parse(readFileSync(process.env.PDF_TABLE_CORPUS, "utf8"))
  : [];

test.use({ autoGoto: false });

function readMergedTable() {
  const store = (window as unknown as { __editor_store: EditorStore })
    .__editor_store;
  const page = store.document?.page(0);
  const table = page?.tables[0];
  if (!page || !table) throw new Error("Table adoption failed");
  const snapshot = table.snapshot();
  return {
    id: table.id,
    rows: table.rows,
    cols: table.cols,
    pageRuled: table.pageRuled,
    spans: snapshot.cells.filter(
      (cell) => cell.rowSpan > 1 || cell.colSpan > 1,
    ),
    rules: page.rules.map(({ x, y, width, height }) => ({
      x,
      y,
      width,
      height,
    })),
  };
}

function expectNoRulesInside(rect: PageRect, rules: PageRect[]) {
  for (const rule of rules) {
    if (rule.width <= rule.height) {
      const x = rule.x + rule.width / 2;
      const overlap =
        Math.min(rule.y + rule.height, rect.y + rect.height) -
        Math.max(rule.y, rect.y);
      if (x > rect.x + 1 && x < rect.x + rect.width - 1)
        expect(overlap).toBeLessThanOrEqual(1);
    } else {
      const y = rule.y + rule.height / 2;
      const overlap =
        Math.min(rule.x + rule.width, rect.x + rect.width) -
        Math.max(rule.x, rect.x);
      if (y > rect.y + 1 && y < rect.y + rect.height - 1)
        expect(overlap).toBeLessThanOrEqual(1);
    }
  }
}

test("merged cells retain their borders after a structural edit and export", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await page
    .getByTestId("pdf-editor-file-input")
    .setInputFiles(
      path.join(
        import.meta.dirname,
        "../test-fixtures/merged-table-sample.pdf",
      ),
    );
  await page.waitForFunction(() => {
    const store = (window as unknown as { __editor_store: EditorStore })
      .__editor_store;
    return store.getState().firstPageRendered && !store.getState().loading;
  });
  await page
    .locator('[data-testid^="pdf-editor-recognized-table-edit-"]')
    .first()
    .click();
  const before = await page.evaluate(readMergedTable);
  expect({
    rows: before.rows,
    cols: before.cols,
    pageRuled: before.pageRuled,
  }).toEqual({ rows: 7, cols: 5, pageRuled: true });
  const expectedSpans = [
    { row: 1, col: 0, rowSpan: 1, colSpan: 2 },
    { row: 2, col: 0, rowSpan: 2, colSpan: 1 },
    { row: 6, col: 0, rowSpan: 1, colSpan: 3 },
  ];
  expect(
    before.spans.map(({ row, col, rowSpan, colSpan }) => ({
      row,
      col,
      rowSpan,
      colSpan,
    })),
  ).toEqual(expectedSpans);
  await page.getByTestId(`pdf-editor-table-add-row-${before.id}`).click();
  const after = await page.evaluate(readMergedTable);
  expect(after.rows).toBe(8);
  expect(after.cols).toBe(5);
  for (const span of after.spans) expectNoRulesInside(span.rect, after.rules);
  await page.keyboard.press("Control+z");
  expect((await page.evaluate(readMergedTable)).rows).toBe(7);
  await page.keyboard.press("Control+y");
  expect((await page.evaluate(readMergedTable)).rows).toBe(8);
  await page
    .getByTestId(`pdf-editor-table-cell-${before.id}-7-0`)
    .fill("Follow-up");
  await page.getByTestId(`pdf-editor-table-cell-${before.id}-7-1`).fill("Kim");
  await page.getByTestId(`pdf-editor-table-add-row-${before.id}`).focus();
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-download").click();
  const saved = testInfo.outputPath("merged-edited.pdf");
  await (await downloaded).saveAs(saved);
  await testInfo.attach("edited merged table", {
    path: saved,
    contentType: "application/pdf",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("pdf-editor-file-input").setInputFiles(saved);
  await page.waitForFunction(() => {
    const store = (window as unknown as { __editor_store: EditorStore })
      .__editor_store;
    return store.getState().firstPageRendered && !store.getState().loading;
  });
  await page
    .locator('[data-testid^="pdf-editor-recognized-table-edit-"]')
    .first()
    .click();
  const reopened = await page.evaluate(readMergedTable);
  expect({ rows: reopened.rows, cols: reopened.cols }).toEqual({
    rows: 8,
    cols: 5,
  });
  expect(
    reopened.spans.map(({ row, col, rowSpan, colSpan }) => ({
      row,
      col,
      rowSpan,
      colSpan,
    })),
  ).toEqual(expectedSpans);
  for (const span of reopened.spans)
    expectNoRulesInside(span.rect, reopened.rules);
  await page.screenshot({
    path: testInfo.outputPath("merged-reopened.png"),
    fullPage: true,
  });
});

for (const file of [fixture, ...corpus]) {
  test(`table editing survives Done, undo and export: ${path.basename(file)}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    const onPageError = (error: Error) => errors.push(error.message);
    page.on("pageerror", onPageError);
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
    // WebKit reports the old page's blob reads cut off by the reload as errors.
    page.off("pageerror", onPageError);
    await page.reload({ waitUntil: "domcontentloaded" });
    page.on("pageerror", onPageError);
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
