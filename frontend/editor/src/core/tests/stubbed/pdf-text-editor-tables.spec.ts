import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Drives the real PDFium object path: insert a bordered table, grow it by a row
// and a column, type into a cell, and undo/redo the lot. The unit tests cover
// the bookkeeping; this proves the actual engine calls render and survive.

// Browser-side reader: inlined into every page.evaluate because helpers from
// this Node module are not in scope inside the page.
const STORE = `(window).__editor_store`;

test.describe("PDF text editor - tables", () => {
  test("insert, grow, fill, and undo a table", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 15_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(
        path.join(
          import.meta.dirname,
          "../test-fixtures",
          "paragraph-sample.pdf",
        ),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);

    const runsBefore = (await page.evaluate(
      `${STORE}.state.pages[0].runs.length`,
    )) as number;

    // Arm "Add table" and drop one onto the page.
    await page.getByTestId("pdf-editor-add-table").click();
    const box = await page.getByTestId("pdf-editor-page-0").boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(
      box!.x + box!.width * 0.4,
      box!.y + box!.height * 0.4,
    );

    // A synthetic table now exists in the store.
    await page.waitForFunction(
      `(${STORE}.state.pages[0].tables ? ${STORE}.state.pages[0].tables.length : 0) > 0`,
      undefined,
      { timeout: 10_000 },
    );
    const tableId = (await page.evaluate(
      `${STORE}.state.pages[0].tables[0].id`,
    )) as string;
    const dims0 = (await page.evaluate(
      `(t => ({ rows: t.rows, cols: t.cols }))(${STORE}.state.pages[0].tables[0])`,
    )) as { rows: number; cols: number };
    expect(dims0).toEqual({ rows: 3, cols: 3 });

    // Its overlay + controls render.
    await expect(page.getByTestId(`pdf-editor-table-${tableId}`)).toBeVisible();

    // Grow it by a row and a column.
    await page.getByTestId(`pdf-editor-table-add-row-${tableId}`).click();
    await page.getByTestId(`pdf-editor-table-add-col-${tableId}`).click();
    await page.waitForTimeout(300);
    const dims1 = (await page.evaluate(
      `(t => ({ rows: t.rows, cols: t.cols }))(${STORE}.state.pages[0].tables[0])`,
    )) as { rows: number; cols: number };
    expect(dims1).toEqual({ rows: 4, cols: 4 });

    // Type into the top-left cell.
    const cell = page.getByTestId(`pdf-editor-table-cell-${tableId}-0-0`);
    await cell.click();
    await cell.type("Hello");
    await page.mouse.click(box!.x + 5, box!.y + 5); // blur to commit
    await page.waitForTimeout(500);

    const afterFill = (await page.evaluate(
      `(s => { const t = s.state.pages[0].tables[0]; const c = t.cells.find(x => x.row === 0 && x.col === 0); return { runs: s.state.pages[0].runs.length, filled: c ? c.runIds.length : 0 }; })(${STORE})`,
    )) as { runs: number; filled: number };
    // A new run backs the cell.
    expect(afterFill.runs).toBeGreaterThan(runsBefore);
    expect(afterFill.filled).toBe(1);

    // Undo everything (fill, add-col, add-row, insert) and the table is gone.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(150);
    }
    const afterUndo = (await page.evaluate(
      `(s => ({ tables: s.state.pages[0].tables ? s.state.pages[0].tables.length : 0, runs: s.state.pages[0].runs.length }))(${STORE})`,
    )) as { tables: number; runs: number };
    expect(afterUndo.tables).toBe(0);
    expect(afterUndo.runs).toBe(runsBefore);

    // Redo the insert and it comes back.
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(300);
    const afterRedo = (await page.evaluate(
      `${STORE}.state.pages[0].tables ? ${STORE}.state.pages[0].tables.length : 0`,
    )) as number;
    expect(afterRedo).toBe(1);
  });

  test("resizes a column, a row, and the whole table", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 15_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(
        path.join(
          import.meta.dirname,
          "../test-fixtures",
          "paragraph-sample.pdf",
        ),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);

    await page.getByTestId("pdf-editor-add-table").click();
    const box = await page.getByTestId("pdf-editor-page-0").boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(
      box!.x + box!.width * 0.35,
      box!.y + box!.height * 0.45,
    );
    await page.waitForFunction(
      `(${STORE}.state.pages[0].tables ? ${STORE}.state.pages[0].tables.length : 0) > 0`,
      undefined,
      { timeout: 10_000 },
    );
    const tableId = (await page.evaluate(
      `${STORE}.state.pages[0].tables[0].id`,
    )) as string;

    const geometry = async () =>
      (await page.evaluate(
        `(t => ({ cols: t.colEdges.slice(), rows: t.rowEdges.slice(), w: t.bounds.width, h: t.bounds.height }))(${STORE}.state.pages[0].tables[0])`,
      )) as { cols: number[]; rows: number[]; w: number; h: number };

    // Drag a handle by (dx, dy) CSS px from its centre.
    const dragHandle = async (testid: string, dx: number, dy: number) => {
      const b = await page.getByTestId(testid).boundingBox();
      expect(b).not.toBeNull();
      await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        b!.x + b!.width / 2 + dx,
        b!.y + b!.height / 2 + dy,
        { steps: 10 },
      );
      await page.mouse.up();
      await page.waitForTimeout(300);
    };

    const start = await geometry();

    // A plain edge drag resizes THAT column and the table grows with it.
    await dragHandle(`pdf-editor-table-col-handle-${tableId}-1`, 50, 0);
    const afterCol = await geometry();
    expect(afterCol.cols[1]).toBeGreaterThan(start.cols[1]);
    expect(afterCol.cols[0]).toBeCloseTo(start.cols[0], 3);
    expect(afterCol.w).toBeGreaterThan(start.w);
    // Columns after it keep their own widths - they slide, they do not shrink.
    expect(afterCol.cols[2] - afterCol.cols[1]).toBeCloseTo(
      start.cols[2] - start.cols[1],
      3,
    );

    // Alt makes the two neighbours share instead, at a fixed table width.
    await page.keyboard.down("Alt");
    await dragHandle(`pdf-editor-table-col-handle-${tableId}-1`, -30, 0);
    await page.keyboard.up("Alt");
    const afterShare = await geometry();
    expect(afterShare.w).toBeCloseTo(afterCol.w, 3);
    expect(afterShare.cols[1]).toBeLessThan(afterCol.cols[1]);

    await dragHandle(`pdf-editor-table-row-handle-${tableId}-1`, 0, 20);
    const afterRow = await geometry();
    // CSS y grows downward, PDF y upward, so dragging down lowers the edge.
    expect(afterRow.rows[1]).toBeLessThan(afterShare.rows[1]);
    // That row got taller, so the table did too.
    expect(afterRow.h).toBeGreaterThan(start.h);

    await dragHandle(`pdf-editor-table-scale-handle-${tableId}`, 80, 50);
    const afterScale = await geometry();
    expect(afterScale.w).toBeGreaterThan(start.w);
    expect(afterScale.h).toBeGreaterThan(start.h);

    // Moving is a distinct gesture: the frame travels, no track changes.
    const beforeMove = await geometry();
    await dragHandle(`pdf-editor-table-move-handle-${tableId}`, 40, 25);
    const afterMove = await geometry();
    expect(afterMove.w).toBeCloseTo(beforeMove.w, 3);
    expect(afterMove.h).toBeCloseTo(beforeMove.h, 3);
    expect(afterMove.cols[0]).toBeGreaterThan(beforeMove.cols[0]);
    expect(afterMove.rows[0]).toBeLessThan(beforeMove.rows[0]);

    // Each drag is one undo step, and the geometry comes back exactly.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(200);
    }
    const afterUndo = await geometry();
    expect(afterUndo.cols).toEqual(start.cols);
    expect(afterUndo.rows).toEqual(start.rows);
  });

  test("recognizes a borderless table and makes it editable", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 15_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, "../test-fixtures", "table-sample.pdf"),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);

    // The grid is found from whitespace alone - the fixture draws no rules.
    const recognized = page.locator(
      '[data-testid^="pdf-editor-recognized-table-select-"]',
    );
    await expect(recognized).toHaveCount(1, { timeout: 15_000 });
    await expect(recognized).toHaveText(/4×3/);

    await page
      .locator('[data-testid^="pdf-editor-recognized-table-edit-"]')
      .first()
      .click();
    await page.waitForFunction(
      `(${STORE}.state.pages[0].tables ? ${STORE}.state.pages[0].tables.length : 0) > 0`,
      undefined,
      { timeout: 10_000 },
    );
    const tableId = (await page.evaluate(
      `${STORE}.state.pages[0].tables[0].id`,
    )) as string;

    // Every filled cell must own a distinct run: a column arrives as one
    // paragraph run, and sharing it across cells would move a whole column when
    // one row shifts.
    const mapping = (await page.evaluate(
      `(t => { const ids = t.cells.flatMap(c => c.runIds); return { rows: t.rows, cols: t.cols, filled: ids.length, unique: new Set(ids).size }; })(${STORE}.state.pages[0].tables[0])`,
    )) as { rows: number; cols: number; filled: number; unique: number };
    expect({ rows: mapping.rows, cols: mapping.cols }).toEqual({
      rows: 4,
      cols: 3,
    });
    expect(mapping.unique).toBe(mapping.filled);
    const styleSize = (await page.evaluate(
      `${STORE}.state.pages[0].tables[0].columnStyles[1].fontSize`,
    )) as number;

    // Structural editing is now available on a table the document merely drew.
    await page.getByTestId(`pdf-editor-table-add-row-${tableId}`).click();
    await page.getByTestId(`pdf-editor-table-add-col-${tableId}`).click();
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(
        `(t => t.rows + "x" + t.cols)(${STORE}.state.pages[0].tables[0])`,
      ),
    ).toBe("5x4");

    // The fixture's first column is left-aligned prose and the rest are
    // right-aligned numbers; that has to survive into the model.
    const styles = (await page.evaluate(
      `${STORE}.state.pages[0].tables[0].columnStyles.map(s => s.align)`,
    )) as string[];
    expect(styles[0]).toBe("left");
    expect(styles[1]).toBe("right");

    // And an empty cell takes typed text, written in that column's style.
    const runsBefore = (await page.evaluate(
      `${STORE}.state.pages[0].runs.length`,
    )) as number;
    const cell = page.getByTestId(`pdf-editor-table-cell-${tableId}-4-1`);
    await cell.click();
    await cell.type("1,000,000");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    expect(
      (await page.evaluate(`${STORE}.state.pages[0].runs.length`)) as number,
    ).toBe(runsBefore + 1);

    // It sits against the column's right edge, not the left one it was
    // emitted at, and carries the column's size.
    const placed = (await page.evaluate(
      `(() => { const t = ${STORE}.state.pages[0].tables[0];
         const c = t.cells.find(x => x.row === 4 && x.col === 1);
         const run = ${STORE}.state.pages[0].runs.find(r => r.id === c.runIds[0]);
         return { lead: run.bounds.x - c.rect.x,
                  trail: (c.rect.x + c.rect.width) - (run.bounds.x + run.bounds.width),
                  size: run.fontSize }; })()`,
    )) as { lead: number; trail: number; size: number };
    expect(placed.trail).toBeLessThan(placed.lead);
    expect(placed.size).toBeCloseTo(styleSize, 1);

    // Leaving the grid restores the recognized chip; the text stays put.
    await page.getByTestId(`pdf-editor-table-done-${tableId}`).click();
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(`(${STORE}.state.pages[0].tables || []).length`),
    ).toBe(0);
    await expect(
      page.locator('[data-testid^="pdf-editor-recognized-table-select-"]'),
    ).toHaveCount(1);
  });
});
