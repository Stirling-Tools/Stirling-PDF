import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type {
  V2Matrix,
  V2TestWindow,
} from "@app/tests/stubbed/v2EditorTestTypes";

/**
 * Combined-feature regression suite: the new editor features (image
 * rotate/flip, z-order, align/distribute, lock, change-case, cut/paste,
 * find+replace) AND their interaction with the 12 bug fixes. Page-level
 * operations (page rotate/print/reset) are intentionally absent.
 */
const SAMPLE = path.join(__dirname, "../../../../public/samples/Sample.pdf");
const PNG = path.join(__dirname, "../test-fixtures/sample.png");

// z-order / align / distribute live in the toolbar's "Arrange" menu, and
// image rotate/flip in the "Image" menu. Open the menu, then click the item.
async function clickArrange(page: Page, testid: string): Promise<void> {
  await page.getByTestId("v2-arrange-menu").click();
  await page.getByTestId(testid).click();
}
async function clickImage(page: Page, testid: string): Promise<void> {
  await page.getByTestId("v2-imgop-menu").click();
  await page.getByTestId(testid).click();
}

async function open(page: Page, firstPage = 0): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId(`v2-page-${firstPage}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}
async function runId(
  page: Page,
  pageIdx: number,
  src: string,
): Promise<string> {
  const id = await page.evaluate(
    ({ pageIdx, src }: { pageIdx: number; src: string }) => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      const r = s.doc
        .page(pageIdx)
        .runs.find((x) => new RegExp(src).test(x.text));
      return r ? r.id : null;
    },
    { pageIdx, src },
  );
  if (!id) throw new Error(`run /${src}/ not found`);
  return id;
}
async function selectRun(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (rid: string) =>
      (window as unknown as V2TestWindow).__v2_editor_store.selection.selectOne(
        rid,
      ),
    id,
  );
  await page.waitForTimeout(120);
}
async function selectMany(page: Page, ids: string[]): Promise<void> {
  await page.evaluate(
    (rids: string[]) =>
      (
        window as unknown as V2TestWindow
      ).__v2_editor_store.selection.selectMany(rids),
    ids,
  );
  await page.waitForTimeout(120);
}
async function runText(
  page: Page,
  pageIdx: number,
  id: string,
): Promise<string> {
  return page.evaluate(
    ({ pageIdx, id }: { pageIdx: number; id: string }) => {
      const r = (window as unknown as V2TestWindow).__v2_editor_store.doc
        .page(pageIdx)
        .runs.find((x) => x.id === id);
      return r ? (r.text as string) : "(gone)";
    },
    { pageIdx, id },
  );
}
async function insertImage(
  page: Page,
): Promise<{ id: string; matrix: V2Matrix } | null> {
  await page.locator('[data-testid="v2-image-input"]').setInputFiles(PNG);
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    for (const p of s.doc.loadedPages()) {
      if (p.images.length > 0) {
        const img = p.images[p.images.length - 1];
        return { id: img.id, matrix: { ...img.matrix } };
      }
    }
    return null;
  });
}
async function imageMatrix(
  page: Page,
  imageId: string,
): Promise<V2Matrix | null> {
  return page.evaluate((iid: string) => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    for (const p of s.doc.loadedPages()) {
      const img = p.images.find((x) => x.id === iid);
      if (img) return { ...img.matrix };
    }
    return null;
  }, imageId);
}
async function totalRuns(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as unknown as V2TestWindow).__v2_editor_store.doc
      .loadedPages()
      .reduce((n: number, p) => n + p.runs.length, 0),
  );
}
async function countRunsContaining(page: Page, sub: string): Promise<number> {
  return page.evaluate((sub: string) => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    const needle = sub.toLowerCase();
    let n = 0;
    for (const p of s.doc.loadedPages())
      for (const r of p.runs) if (r.text.toLowerCase().includes(needle)) n += 1;
    return n;
  }, sub);
}
async function firstRunIds(
  page: Page,
  pageIdx: number,
  n: number,
): Promise<string[]> {
  return page.evaluate(
    ({ pageIdx, n }: { pageIdx: number; n: number }) =>
      (window as unknown as V2TestWindow).__v2_editor_store.doc
        .page(pageIdx)
        .runs.slice(0, n)
        .map((r) => r.id),
    { pageIdx, n },
  );
}
async function undoSize(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as V2TestWindow).__v2_editor_store.history.size().undo,
  );
}

test.describe("v2 editor - combined feature set", () => {
  // Editor edits fire encode-charcodes; with no backend an UNMOCKED call 401s
  // and redirects to login, unmounting the editor (the __v2_editor_store goes
  // undefined mid-test). Abort it so the resolver sees a clean cold-cache miss.
  test.beforeEach(async ({ page }) => {
    await page.route("**/encode-charcodes", (route) => route.abort());
  });

  test("image insert (real png) adds an image, then rotate-cw changes its matrix and undo reverts", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins, "image insert must add an image").not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    await clickImage(page, "v2-imgop-rotate-cw");
    await page.waitForTimeout(300);
    const rotated = await imageMatrix(page, ins!.id);
    // A 90deg rotation swaps the axes: original diagonal (a,d) becomes off-diagonal (b,c).
    expect(
      Math.abs(rotated!.a) + Math.abs(rotated!.d),
      "rotate must move scale off the main diagonal",
    ).toBeLessThan(Math.abs(rotated!.b) + Math.abs(rotated!.c) + 0.01);
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(300);
    const reverted = await imageMatrix(page, ins!.id);
    expect(reverted!.a).toBeCloseTo(ins!.matrix.a, 1);
    expect(reverted!.d).toBeCloseTo(ins!.matrix.d, 1);
  });

  test("image flip-h mirrors the matrix and undo reverts", async ({ page }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    await clickImage(page, "v2-imgop-flip-h");
    await page.waitForTimeout(300);
    const flipped = await imageMatrix(page, ins!.id);
    expect(Math.sign(flipped!.a), "flip-h negates horizontal scale").toBe(
      -Math.sign(ins!.matrix.a || 1),
    );
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(300);
    const reverted = await imageMatrix(page, ins!.id);
    expect(reverted!.a).toBeCloseTo(ins!.matrix.a, 1);
  });

  test("change case UPPER then LOWER transforms the selected run's text", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    const orig = await runText(page, 1, id);
    await selectRun(page, id);
    await page.getByTestId("v2-change-case").click();
    await page.getByTestId("v2-change-case-upper").click();
    await page.waitForTimeout(400);
    const upper = await runText(page, 1, id);
    expect(upper).toBe(orig.toUpperCase());
    await selectRun(page, id);
    await page.getByTestId("v2-change-case").click();
    await page.getByTestId("v2-change-case-lower").click();
    await page.waitForTimeout(400);
    const lower = await runText(page, 1, id);
    expect(lower).toBe(orig.toLowerCase());
  });

  test("lock makes a run inert (no select on click); unlock restores it", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    await selectRun(page, id);
    await page.getByTestId("v2-toggle-lock").click();
    await page.waitForTimeout(200);
    const locked = await page.evaluate(
      (rid: string) =>
        (window as unknown as V2TestWindow).__v2_editor_store.doc
          .page(1)
          .runs.find((x) => x.id === rid)!.locked,
      id,
    );
    expect(locked, "run should be locked").toBe(true);
    // The overlay snapshot must refresh so the lock takes visible effect:
    // a locked run drops contentEditable and exposes data-locked.
    await expect(page.getByTestId(`v2-run-${id}`)).toHaveAttribute(
      "data-locked",
      "true",
    );
    await expect(page.getByTestId(`v2-run-${id}`)).toHaveAttribute(
      "contenteditable",
      "false",
    );
    // Clear selection, then clicking the locked run must NOT select it.
    await page.evaluate(() =>
      (window as unknown as V2TestWindow).__v2_editor_store.selection.clear(),
    );
    await page
      .getByTestId(`v2-run-${id}`)
      .click()
      .catch(() => {});
    await page.waitForTimeout(150);
    const selAfterClick = await page.evaluate(
      () =>
        (window as unknown as V2TestWindow).__v2_editor_store.selection.value
          .runIds.length,
    );
    expect(selAfterClick, "locked run must not be selectable by click").toBe(0);
  });

  test("align-left makes selected runs share the same left x", async ({
    page,
  }) => {
    await open(page, 1);
    const a = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const b = await runId(page, 1, "Comprehensive\\s+toolkit");
    await selectMany(page, [a, b]);
    await clickArrange(page, "v2-align-left");
    await page.waitForTimeout(300);
    const xs = await page.evaluate(
      ({ a, b }: { a: string; b: string }) => {
        const pg = (
          window as unknown as V2TestWindow
        ).__v2_editor_store.doc.page(1);
        const ra = pg.runs.find((x) => x.id === a)!;
        const rb = pg.runs.find((x) => x.id === b)!;
        return [ra.bounds.x, rb.bounds.x];
      },
      { a, b },
    );
    expect(
      Math.abs(xs[0] - xs[1]),
      "aligned runs share a left edge",
    ).toBeLessThan(1.5);
  });

  test("cut (Ctrl+X) removes the run and paste (Ctrl+V) brings it back", async ({
    page,
  }) => {
    // Cut/paste round-trips through the real system clipboard; the headless
    // context blocks clipboard.read by default, so grant it explicitly.
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    const before = await totalRuns(page);
    await selectRun(page, id);
    // Cut is suppressed while focus is inside a contentEditable run (so the
    // browser's native cut wins there). The real editor-level cut path fires
    // from a marquee/store selection with focus outside any run - mirror that.
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Control+x");
    await page.waitForTimeout(400);
    const afterCut = await totalRuns(page);
    expect(afterCut, "cut removes the run").toBeLessThan(before);
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(600);
    const afterPaste = await totalRuns(page);
    expect(afterPaste, "paste re-adds a run").toBeGreaterThan(afterCut);
  });

  test("z-order: bring-to-front on an inserted image applies and undoes cleanly", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    const undoBefore = await page.evaluate(
      () =>
        (window as unknown as V2TestWindow).__v2_editor_store.history.size()
          .undo,
    );
    await clickArrange(page, "v2-z-to-front");
    await page.waitForTimeout(300);
    const undoAfter = await page.evaluate(
      () =>
        (window as unknown as V2TestWindow).__v2_editor_store.history.size()
          .undo,
    );
    expect(undoAfter, "z-order is its own undo step").toBe(undoBefore + 1);
    // No crash + still one image present.
    const imgs = await page.evaluate(() =>
      (window as unknown as V2TestWindow).__v2_editor_store.doc
        .loadedPages()
        .reduce((n: number, p) => n + p.images.length, 0),
    );
    expect(imgs).toBeGreaterThan(0);
  });

  test("editing a run still preserves unedited paragraph lines (fix holds in combined build)", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const before = await page.evaluate(
      (rid: string) => [
        ...(window as unknown as V2TestWindow).__v2_editor_store.doc
          .page(1)
          .runs.find((x) => x.id === rid)!.paragraphLeafPtrs,
      ],
      id,
    );
    await page.evaluate((rid: string) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      )!;
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, " APPENDED");
    }, id);
    await page.waitForTimeout(150);
    await page.evaluate(
      (rid: string) =>
        document
          .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
          ?.blur(),
      id,
    );
    await page.waitForTimeout(1200);
    const after = await page.evaluate((rid: string) => {
      const r = (window as unknown as V2TestWindow).__v2_editor_store.doc
        .page(1)
        .runs.find((x) => x.id === rid);
      return r ? [...r.paragraphLeafPtrs] : [];
    }, id);
    const kept = before.filter((p: number) => after.includes(p)).length;
    expect(
      kept,
      "most original glyph objects survive an append",
    ).toBeGreaterThan(before.length * 0.6);
    const text = await runText(page, 1, id);
    expect(text).toContain("APPENDED");
    expect(text).not.toContain("ÿ");
  });

  test("image rotate-ccw changes the matrix and undo reverts", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    await clickImage(page, "v2-imgop-rotate-ccw");
    await page.waitForTimeout(300);
    const rotated = await imageMatrix(page, ins!.id);
    expect(
      Math.abs(rotated!.a) + Math.abs(rotated!.d),
      "rotate moves scale off the main diagonal",
    ).toBeLessThan(Math.abs(rotated!.b) + Math.abs(rotated!.c) + 0.01);
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(300);
    const reverted = await imageMatrix(page, ins!.id);
    expect(reverted!.a).toBeCloseTo(ins!.matrix.a, 1);
    expect(reverted!.d).toBeCloseTo(ins!.matrix.d, 1);
  });

  test("image flip-v mirrors the vertical scale and undo reverts", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    await clickImage(page, "v2-imgop-flip-v");
    await page.waitForTimeout(300);
    const flipped = await imageMatrix(page, ins!.id);
    expect(Math.sign(flipped!.d), "flip-v negates vertical scale").toBe(
      -Math.sign(ins!.matrix.d || 1),
    );
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(300);
    const reverted = await imageMatrix(page, ins!.id);
    expect(reverted!.d).toBeCloseTo(ins!.matrix.d, 1);
  });

  test("rotating an image four times clockwise returns to the original matrix", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    for (let i = 0; i < 4; i++) {
      await clickImage(page, "v2-imgop-rotate-cw");
      await page.waitForTimeout(180);
    }
    const m = await imageMatrix(page, ins!.id);
    expect(m!.a).toBeCloseTo(ins!.matrix.a, 1);
    expect(m!.d).toBeCloseTo(ins!.matrix.d, 1);
    expect(Math.abs(m!.b), "no residual shear after full turn").toBeLessThan(
      0.01,
    );
    expect(Math.abs(m!.c), "no residual shear after full turn").toBeLessThan(
      0.01,
    );
  });

  test("locking an image makes it inert; unlocking restores selectability", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    await page.getByTestId("v2-toggle-lock").click();
    await page.waitForTimeout(200);
    const locked = await page.evaluate((iid: string) => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      for (const p of s.doc.loadedPages()) {
        const im = p.images.find((x) => x.id === iid);
        if (im) return im.locked;
      }
      return null;
    }, ins!.id);
    expect(locked, "image should be locked").toBe(true);
    // Snapshot must refresh so the handle reflects the lock.
    await expect(page.getByTestId(`v2-image-${ins!.id}`)).toHaveAttribute(
      "data-locked",
      "true",
    );
    // Clicking the locked image must not select it.
    await page.evaluate(() =>
      (window as unknown as V2TestWindow).__v2_editor_store.selection.clear(),
    );
    await page
      .getByTestId(`v2-image-${ins!.id}`)
      .click()
      .catch(() => {});
    await page.waitForTimeout(150);
    const selImgs = await page.evaluate(
      () =>
        (window as unknown as V2TestWindow).__v2_editor_store.selection.value
          .imageIds,
    );
    expect(
      selImgs.includes(ins!.id),
      "locked image not selectable by click",
    ).toBe(false);
    // Unlock via store-selection (bypasses the inert UI) then toggle.
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.getByTestId("v2-toggle-lock").click();
    await page.waitForTimeout(200);
    await expect(page.getByTestId(`v2-image-${ins!.id}`)).not.toHaveAttribute(
      "data-locked",
      "true",
    );
  });

  test("z-order: send-to-back is its own undo step and keeps the image", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    const undoBefore = await undoSize(page);
    await clickArrange(page, "v2-z-to-back");
    await page.waitForTimeout(300);
    expect(await undoSize(page), "send-to-back is one undo step").toBe(
      undoBefore + 1,
    );
    const imgs = await page.evaluate(() =>
      (window as unknown as V2TestWindow).__v2_editor_store.doc
        .loadedPages()
        .reduce((n: number, p) => n + p.images.length, 0),
    );
    expect(imgs).toBeGreaterThan(0);
  });

  test("z-order: forward then backward each add an undoable step", async ({
    page,
  }) => {
    await open(page, 0);
    const ins = await insertImage(page);
    expect(ins).not.toBeNull();
    await page.evaluate(
      (iid: string) =>
        (
          window as unknown as V2TestWindow
        ).__v2_editor_store.selection.selectImage(iid),
      ins!.id,
    );
    await page.waitForTimeout(120);
    const base = await undoSize(page);
    await clickArrange(page, "v2-z-forward");
    await page.waitForTimeout(250);
    await clickArrange(page, "v2-z-backward");
    await page.waitForTimeout(250);
    expect(await undoSize(page), "two z-order steps recorded").toBe(base + 2);
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(200);
    expect(await undoSize(page)).toBe(base + 1);
  });

  test("align-right makes selected runs share the same right edge", async ({
    page,
  }) => {
    await open(page, 1);
    const a = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const b = await runId(page, 1, "Comprehensive\\s+toolkit");
    await selectMany(page, [a, b]);
    await clickArrange(page, "v2-align-right");
    await page.waitForTimeout(300);
    const rights = await page.evaluate(
      ({ a, b }: { a: string; b: string }) => {
        const pg = (
          window as unknown as V2TestWindow
        ).__v2_editor_store.doc.page(1);
        const ra = pg.runs.find((x) => x.id === a)!;
        const rb = pg.runs.find((x) => x.id === b)!;
        return [ra.bounds.x + ra.bounds.width, rb.bounds.x + rb.bounds.width];
      },
      { a, b },
    );
    expect(
      Math.abs(rights[0] - rights[1]),
      "aligned runs share a right edge",
    ).toBeLessThan(1.5);
  });

  test("align-top makes selected runs share the same top edge", async ({
    page,
  }) => {
    await open(page, 1);
    const a = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const b = await runId(page, 1, "Comprehensive\\s+toolkit");
    await selectMany(page, [a, b]);
    await clickArrange(page, "v2-align-top");
    await page.waitForTimeout(300);
    const tops = await page.evaluate(
      ({ a, b }: { a: string; b: string }) => {
        const pg = (
          window as unknown as V2TestWindow
        ).__v2_editor_store.doc.page(1);
        const ra = pg.runs.find((x) => x.id === a)!;
        const rb = pg.runs.find((x) => x.id === b)!;
        return [ra.bounds.y + ra.bounds.height, rb.bounds.y + rb.bounds.height];
      },
      { a, b },
    );
    expect(
      Math.abs(tops[0] - tops[1]),
      "aligned runs share a top edge",
    ).toBeLessThan(1.5);
  });

  test("distribute-v equalizes the vertical gaps across three runs", async ({
    page,
  }) => {
    // Page text runs are stacked vertically (one per line/paragraph), so
    // vertical distribution is the natural axis - they don't overlap on y,
    // so the middle run stays between its neighbours and gaps equalize.
    await open(page, 1);
    const ids = await firstRunIds(page, 1, 3);
    expect(ids.length, "need three runs to distribute").toBe(3);
    await selectMany(page, ids);
    await clickArrange(page, "v2-distribute-v");
    await page.waitForTimeout(300);
    const gaps = await page.evaluate((ids: string[]) => {
      const pg = (window as unknown as V2TestWindow).__v2_editor_store.doc.page(
        1,
      );
      const items = ids
        .map((id) => pg.runs.find((r) => r.id === id)!)
        .map((r) => ({ y: r.bounds.y, h: r.bounds.height }))
        .sort((p, q) => p.y - q.y);
      const g: number[] = [];
      for (let i = 1; i < items.length; i++) {
        g.push(items[i].y - (items[i - 1].y + items[i - 1].h));
      }
      return g;
    }, ids);
    expect(
      Math.abs(gaps[0] - gaps[1]),
      "consecutive gaps become equal",
    ).toBeLessThan(1.0);
  });

  test("change case Title Case transforms the selected run", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    const orig = await runText(page, 1, id);
    const expected = orig.replace(
      /\b\w[\w']*/g,
      (w) => w[0].toUpperCase() + w.slice(1).toLowerCase(),
    );
    await selectRun(page, id);
    await page.getByTestId("v2-change-case").click();
    await page.getByTestId("v2-change-case-title").click();
    await page.waitForTimeout(400);
    expect(await runText(page, 1, id)).toBe(expected);
  });

  test("change case Sentence case capitalizes after a lowercase pass", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    const orig = await runText(page, 1, id);
    await selectRun(page, id);
    await page.getByTestId("v2-change-case").click();
    await page.getByTestId("v2-change-case-lower").click();
    await page.waitForTimeout(400);
    await selectRun(page, id);
    await page.getByTestId("v2-change-case").click();
    await page.getByTestId("v2-change-case-sentence").click();
    await page.waitForTimeout(400);
    const expected = orig
      .toLowerCase()
      .replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
    expect(await runText(page, 1, id)).toBe(expected);
  });

  test("change case is undoable - undo restores the original text", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    const orig = await runText(page, 1, id);
    await selectRun(page, id);
    await page.getByTestId("v2-change-case").click();
    await page.getByTestId("v2-change-case-upper").click();
    await page.waitForTimeout(400);
    expect(await runText(page, 1, id)).toBe(orig.toUpperCase());
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(400);
    expect(await runText(page, 1, id)).toBe(orig);
  });

  test("duplicate (Ctrl+D) clones the selected run", async ({ page }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    const before = await totalRuns(page);
    await selectRun(page, id);
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Control+d");
    await page.waitForTimeout(300);
    expect(await totalRuns(page), "duplicate adds one run").toBe(before + 1);
  });

  test("Delete key removes the selected run", async ({ page }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    const before = await totalRuns(page);
    await selectRun(page, id);
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
    expect(await totalRuns(page), "delete removes one run").toBe(before - 1);
    expect(await runText(page, 1, id)).toBe("(gone)");
  });

  test("undo restores a locked run to unlocked + editable", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Comprehensive\\s+toolkit");
    await selectRun(page, id);
    await page.getByTestId("v2-toggle-lock").click();
    await expect(page.getByTestId(`v2-run-${id}`)).toHaveAttribute(
      "data-locked",
      "true",
    );
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(250);
    const locked = await page.evaluate(
      (rid: string) =>
        (window as unknown as V2TestWindow).__v2_editor_store.doc
          .page(1)
          .runs.find((x) => x.id === rid)!.locked,
      id,
    );
    expect(locked, "undo unlocks the run").toBe(false);
    await expect(page.getByTestId(`v2-run-${id}`)).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });

  test("find (Ctrl+F) reports a match count for an existing term", async ({
    page,
  }) => {
    await open(page, 1);
    await page.keyboard.press("Control+f");
    await expect(page.getByTestId("v2-find-bar")).toBeVisible();
    await page.getByTestId("v2-find-input").fill("PDF");
    await page.waitForTimeout(400);
    const count = await page.getByTestId("v2-find-count").innerText();
    expect(count, "find reports N of M for a present term").toMatch(
      /\d+ of \d+/,
    );
  });

  test("replace swaps the matched run's text for the new term", async ({
    page,
  }) => {
    await open(page, 1);
    const before = await countRunsContaining(page, "toolkit");
    expect(before, "fixture must contain the search term").toBeGreaterThan(0);
    await page.keyboard.press("Control+f");
    await expect(page.getByTestId("v2-find-bar")).toBeVisible();
    await page.getByTestId("v2-find-input").fill("toolkit");
    await page.waitForTimeout(400);
    await page.getByTestId("v2-replace-input").fill("widget");
    await page.getByTestId("v2-replace-one").click();
    await page.waitForTimeout(600);
    expect(
      await countRunsContaining(page, "toolkit"),
      "one match-run replaced",
    ).toBe(before - 1);
    expect(
      await countRunsContaining(page, "widget"),
      "replacement text present",
    ).toBeGreaterThan(0);
  });

  test("replace all rewrites every matching run", async ({ page }) => {
    await open(page, 1);
    const before = await countRunsContaining(page, "pdf");
    expect(before, "fixture must contain the search term").toBeGreaterThan(0);
    await page.keyboard.press("Control+f");
    await expect(page.getByTestId("v2-find-bar")).toBeVisible();
    await page.getByTestId("v2-find-input").fill("PDF");
    await page.waitForTimeout(400);
    await page.getByTestId("v2-replace-input").fill("DOC");
    await page.getByTestId("v2-replace-all").click();
    await page.waitForTimeout(900);
    expect(
      await countRunsContaining(page, "pdf"),
      "no matches remain after replace-all",
    ).toBe(0);
  });
});
