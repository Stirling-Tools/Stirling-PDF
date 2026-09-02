import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Font size and font family, judged on the PIXELS PDFium paints - not on the
// numbers in the store. Every test here reads the page <canvas> back and
// measures the glyph ink: its bounding box, its area, its per-row profile.
// A size command that updates the model but never reaches the renderer, or a
// family swap the rasteriser ignores, is invisible to a model-only assertion
// and loud here.
//
// Fixtures and why:
//   cropbox-control.pdf - one page, one text object, "Hi" at 24pt Helvetica.
//     No descenders, nothing else inked, so the whole-page dark-pixel box IS
//     the glyph box and its bottom row IS the baseline.
//   paragraph-sample.pdf - an 18pt heading over an 11pt four-line paragraph,
//     for scope (does a resize stay inside the run it was aimed at?).
//   many-pages-sample.pdf - two same-size runs per page, for a multi-run
//     select-all resize.

const fx = (n: string) => path.join(import.meta.dirname, "../test-fixtures", n);
const CONTROL = fx("cropbox-control.pdf");
const PARAGRAPH = fx("paragraph-sample.pdf");
const MANY_PAGES = fx("many-pages-sample.pdf");

interface Ink {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  n: number;
  canvasW: number;
  canvasH: number;
}

/** Dark-pixel bounding box + area inside an optional canvas-row band. */
function measureInk(arg: {
  pageIndex: number;
  band: [number, number] | null;
}): Ink | null {
  const canvas = document.querySelector<HTMLCanvasElement>(
    `[data-testid="pdf-editor-page-${arg.pageIndex}"] canvas`,
  );
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { data, width, height } = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const y0 = arg.band ? Math.max(0, Math.floor(arg.band[0])) : 0;
  const y1 = arg.band ? Math.min(height, Math.ceil(arg.band[1])) : height;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      // "ink" = dark text on a light page.
      if (data[o] < 160 && data[o + 1] < 160) {
        n += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (n === 0)
    return {
      minX: 0,
      minY: 0,
      maxX: -1,
      maxY: -1,
      n: 0,
      canvasW: width,
      canvasH: height,
    };
  return { minX, minY, maxX, maxY, n, canvasW: width, canvasH: height };
}

/** Dark-pixel count per canvas row, over the whole page width. */
function measureRows(arg: { pageIndex: number }): number[] | null {
  const canvas = document.querySelector<HTMLCanvasElement>(
    `[data-testid="pdf-editor-page-${arg.pageIndex}"] canvas`,
  );
  if (!canvas || canvas.width === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { data, width, height } = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    let c = 0;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (data[o] < 160 && data[o + 1] < 160) c += 1;
    }
    rows.push(c);
  }
  return rows;
}

const inkKey = (i: Ink) => `${i.minX},${i.minY},${i.maxX},${i.maxY},${i.n}`;
const inkW = (i: Ink) => i.maxX - i.minX;
const inkH = (i: Ink) => i.maxY - i.minY;

async function openEditor(
  page: import("@playwright/test").Page,
  file: string,
): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
}

/**
 * Read the ink once the bitmap has stopped moving. When `differentFrom` is
 * given the poll additionally waits for the repaint to actually land, so a
 * command that never reaches the renderer times out instead of passing on a
 * stale bitmap.
 */
async function settledInk(
  page: import("@playwright/test").Page,
  opts: {
    pageIndex?: number;
    band?: [number, number] | null;
    differentFrom?: Ink | null;
    timeout?: number;
  } = {},
): Promise<Ink> {
  const pageIndex = opts.pageIndex ?? 0;
  const band = opts.band ?? null;
  const target = opts.differentFrom ? inkKey(opts.differentFrom) : null;
  const deadline = Date.now() + (opts.timeout ?? 30_000);
  let last: string | null = null;
  let lastInk: Ink | null = null;
  while (Date.now() < deadline) {
    const cur = await page.evaluate(measureInk, { pageIndex, band });
    if (cur) {
      const k = inkKey(cur);
      if (k === last && (target === null || k !== target)) return cur;
      last = k;
      lastInk = cur;
    }
    await page.waitForTimeout(350);
  }
  throw new Error(
    `page ${pageIndex} bitmap never settled${
      target ? ` to something other than ${target}` : ""
    }; last read ${last} (${JSON.stringify(lastInk)})`,
  );
}

async function selectRun(
  page: import("@playwright/test").Page,
  testId: string,
): Promise<void> {
  const run = page.locator(`[data-testid="${testId}"]`);
  await expect(run, `fixture must expose ${testId}`).toHaveCount(1);
  await run.click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("pdf-editor-font-size")).toBeEnabled();
}

async function setSize(
  page: import("@playwright/test").Page,
  value: number,
): Promise<void> {
  const input = page.getByTestId("pdf-editor-font-size");
  await expect(input).toBeEnabled();
  await input.fill(String(value));
  await input.blur();
}

async function setFamily(
  page: import("@playwright/test").Page,
  label: string,
): Promise<void> {
  await page.getByTestId("pdf-editor-font-family").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

/**
 * Canvas row that separates page 0's top run from the one below it, derived
 * from the model bounds so the bands are not hard-coded to a fixture layout.
 */
function topRunSplitRow() {
  const store = (
    window as unknown as {
      __editor_store: {
        state: {
          pages: {
            height: number;
            runs: { bounds: { y: number; height: number } }[];
          }[];
        };
      };
    }
  ).__editor_store;
  const p = store.state.pages[0];
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-testid="pdf-editor-page-0"] canvas',
  );
  if (!canvas || canvas.height === 0 || p.runs.length < 2) return null;
  const runs = [...p.runs].sort((a, b) => b.bounds.y - a.bounds.y);
  // Midway between the top run's baseline and the top of the next run down.
  const gapPageY =
    (runs[0].bounds.y + (runs[1].bounds.y + runs[1].bounds.height)) / 2;
  return {
    row: (p.height - gapPageY) * (canvas.height / p.height),
    canvasH: canvas.height,
    runCount: p.runs.length,
  };
}

/** The run's client box expressed in canvas pixels, so it can be compared to ink. */
function overlayInCanvasPx(testId: string) {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-testid="pdf-editor-page-0"] canvas',
  );
  if (!el || !canvas) return null;
  const cb = canvas.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const sx = canvas.width / cb.width;
  const sy = canvas.height / cb.height;
  return {
    left: (r.left - cb.left) * sx,
    top: (r.top - cb.top) * sy,
    right: (r.right - cb.left) * sx,
    bottom: (r.bottom - cb.top) * sy,
  };
}

test.describe("PDF text editor - font size, measured on the rendered page", () => {
  // Would catch: a SetFontSize that updates the model but leaves the page
  // revision (and therefore the PDFium bitmap) untouched, or one that scales
  // the advance widths without scaling the glyphs.
  test("doubling the font size doubles the glyph ink on the page bitmap", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, CONTROL);

    const before = await settledInk(page);
    expect(
      before.n,
      "fixture must actually paint glyphs, or every ratio below is vacuous",
    ).toBeGreaterThan(100);
    expect(
      inkH(before),
      "24pt 'Hi' should be ~25 canvas px tall",
    ).toBeGreaterThan(15);

    await selectRun(page, "pdf-editor-run-p0-t0");
    await setSize(page, 48);
    const after = await settledInk(page, { differentFrom: before });

    const hRatio = inkH(after) / inkH(before);
    const wRatio = inkW(after) / inkW(before);
    expect(
      hRatio,
      `24pt -> 48pt should double the ink height: ${inkH(before)} -> ${inkH(after)} px`,
    ).toBeGreaterThan(1.8);
    expect(hRatio).toBeLessThan(2.25);
    expect(
      wRatio,
      `24pt -> 48pt should double the ink width: ${inkW(before)} -> ${inkW(after)} px`,
    ).toBeGreaterThan(1.8);
    expect(wRatio).toBeLessThan(2.35);
  });

  // Would catch: a resize implemented by moving the text origin (a Td/Tm shift)
  // instead of scaling the font - the baseline would slide up or down.
  test("shrinking the font size keeps the glyph baseline pinned to the same canvas row", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, CONTROL);

    const before = await settledInk(page);
    expect(before.n, "no ink to measure").toBeGreaterThan(100);
    const baselineBefore = before.maxY;

    await selectRun(page, "pdf-editor-run-p0-t0");
    await setSize(page, 12);
    const after = await settledInk(page, { differentFrom: before });

    expect(
      after.n,
      "the 12pt render must still paint something",
    ).toBeGreaterThan(20);
    expect(
      Math.abs(after.maxY - baselineBefore),
      `'Hi' has no descender, so the ink's bottom row is the baseline: ` +
        `${baselineBefore} -> ${after.maxY}`,
    ).toBeLessThanOrEqual(1);
    const hRatio = inkH(after) / inkH(before);
    expect(
      hRatio,
      `24pt -> 12pt should halve the ink height: ${inkH(before)} -> ${inkH(after)} px`,
    ).toBeGreaterThan(0.35);
    expect(hRatio).toBeLessThan(0.65);
    expect(
      after.maxX,
      "shrinking must pull the right edge in, not push it out",
    ).toBeLessThan(before.maxX);
  });

  // Would catch: a size change applied to one axis only (horizontal scale, or a
  // Tz/Tc fudge). Ink area then grows linearly (~4x from 12 to 48) instead of
  // quadratically (~16x).
  test("the inked area scales with the square of the size, not with its width alone", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, CONTROL);

    await selectRun(page, "pdf-editor-run-p0-t0");
    const seen: Record<number, Ink> = {};
    let prev = await settledInk(page);
    for (const size of [12, 24, 48]) {
      await setSize(page, size);
      const ink = await settledInk(page, { differentFrom: prev });
      seen[size] = ink;
      prev = ink;
    }

    expect(seen[12].n, "12pt must paint ink").toBeGreaterThan(20);
    expect(seen[48].n, "48pt must paint ink").toBeGreaterThan(200);

    const areaRatio = seen[48].n / seen[12].n;
    expect(
      areaRatio,
      `4x the point size should be roughly 16x the ink area, and must be far ` +
        `above the 4x a width-only scale would give: ${seen[12].n} -> ${seen[48].n} px`,
    ).toBeGreaterThan(7);
    expect(areaRatio).toBeLessThan(24);

    // And the box grows monotonically in both axes across the three sizes.
    expect(
      inkH(seen[12]),
      `ink height must increase with every size step: ` +
        `${inkH(seen[12])} / ${inkH(seen[24])} / ${inkH(seen[48])} px`,
    ).toBeLessThan(inkH(seen[24]));
    expect(inkH(seen[24])).toBeLessThan(inkH(seen[48]));
    expect(inkW(seen[12])).toBeLessThan(inkW(seen[24]));
    expect(inkW(seen[24])).toBeLessThan(inkW(seen[48]));
  });

  // Would catch: a size command that multiplies the existing text matrix by the
  // requested size instead of setting it - 24 -> 48 -> 24 would then land on a
  // different (compounded) size and repaint a different box.
  test("font size is absolute, not compounding: 24 to 48 and back repaints the original ink box", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, CONTROL);

    const original = await settledInk(page);
    expect(original.n, "no ink to measure").toBeGreaterThan(100);

    await selectRun(page, "pdf-editor-run-p0-t0");
    await setSize(page, 48);
    const big = await settledInk(page, { differentFrom: original });
    expect(
      inkH(big),
      "precondition: the 48pt render must differ, or the round trip proves nothing",
    ).toBeGreaterThan(inkH(original) * 1.5);

    await setSize(page, 24);
    const back = await settledInk(page, { differentFrom: big });

    expect(
      { x: back.minX, y: back.minY, r: back.maxX, b: back.maxY },
      `returning to 24pt must repaint the original box; was ${inkKey(original)}, got ${inkKey(back)}`,
    ).toEqual({
      x: original.minX,
      y: original.minY,
      r: original.maxX,
      b: original.maxY,
    });
    expect(
      Math.abs(back.n - original.n),
      `ink area should come back to ${original.n}px, got ${back.n}px`,
    ).toBeLessThanOrEqual(4);
  });

  // Would catch: a multi-run resize that only repaints the run the toolbar was
  // reading from. The second line's ink band would be untouched in the bitmap
  // even though the store says every run changed.
  test("a select-all resize grows every line's ink band on the page, not just the first", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, MANY_PAGES);

    // Split page 0 between its two runs, in canvas rows, from the model bounds.
    const split = await page.evaluate(topRunSplitRow);
    expect(split, "fixture must give page 0 at least two runs").not.toBeNull();
    const topBand: [number, number] = [0, split!.row];
    const lowBand: [number, number] = [split!.row, split!.canvasH];

    const topBefore = await settledInk(page, { band: topBand });
    const lowBefore = await settledInk(page, { band: lowBand });
    expect(
      topBefore.n,
      "top line must be inked before the resize",
    ).toBeGreaterThan(200);
    expect(
      lowBefore.n,
      "second line must be inked before the resize",
    ).toBeGreaterThan(200);

    await page.keyboard.press("Control+a");
    await page.waitForTimeout(800);
    const selected = await page.evaluate(
      () =>
        (
          window as unknown as {
            __editor_store: { selection: { value: { runIds: string[] } } };
          }
        ).__editor_store.selection.value.runIds.length,
    );
    expect(
      selected,
      "select-all must give a multi-run selection",
    ).toBeGreaterThan(1);

    await setSize(page, 26);
    const topAfter = await settledInk(page, {
      band: topBand,
      differentFrom: topBefore,
    });
    const lowAfter = await settledInk(page, {
      band: lowBand,
      differentFrom: lowBefore,
    });

    for (const [name, b, a] of [
      ["top line", topBefore, topAfter],
      ["second line", lowBefore, lowAfter],
    ] as const) {
      expect(
        inkW(a) / inkW(b),
        `${name}: 18pt -> 26pt should widen the ink by ~1.44x, ${inkW(b)} -> ${inkW(a)} px`,
      ).toBeGreaterThan(1.2);
      expect(
        inkH(a) / inkH(b),
        `${name}: 18pt -> 26pt should heighten the ink, ${inkH(b)} -> ${inkH(a)} px`,
      ).toBeGreaterThan(1.15);
      expect(
        a.n / b.n,
        `${name}: ink area should grow, ${b.n} -> ${a.n} px`,
      ).toBeGreaterThan(1.3);
    }
  });

  // Would catch: an undo that rolls the model back but leaves the rendered page
  // at the new size, or one that restores a subtly different size (the row
  // profile is per-row ink counts, so a 1pt error shows up immediately).
  test("undo after a resize repaints the original glyph row profile", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, CONTROL);

    const before = await settledInk(page);
    expect(before.n, "no ink to measure").toBeGreaterThan(100);
    const rowsBefore = await page.evaluate(measureRows, { pageIndex: 0 });
    expect(rowsBefore, "row profile must be readable").not.toBeNull();
    const inkedRowsBefore = rowsBefore!.filter((c) => c > 0).length;
    expect(
      inkedRowsBefore,
      "precondition: some rows must carry ink",
    ).toBeGreaterThan(5);

    await selectRun(page, "pdf-editor-run-p0-t0");
    await setSize(page, 40);
    const big = await settledInk(page, { differentFrom: before });
    expect(
      inkH(big),
      "precondition: the resize must have landed on the bitmap",
    ).toBeGreaterThan(inkH(before) * 1.3);

    await page.getByTestId("pdf-editor-undo").click();
    await settledInk(page, { differentFrom: big });

    const rowsAfter = await page.evaluate(measureRows, { pageIndex: 0 });
    expect(rowsAfter!.length).toBe(rowsBefore!.length);
    const mismatches = rowsAfter!
      .map((c, y) => ({ y, was: rowsBefore![y], now: c }))
      .filter((r) => Math.abs(r.now - r.was) > 1);
    expect(
      mismatches.slice(0, 8),
      `undo must repaint the pre-resize glyphs row for row (${mismatches.length} rows differ)`,
    ).toEqual([]);
  });

  // Would catch: an overlay box that keeps its pre-resize geometry - the caret
  // and the hit area would then sit off the glyphs the user can see.
  test("the run overlay box grows in step with the ink it covers", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH);

    await selectRun(page, "pdf-editor-run-p0-t0");
    const split = await page.evaluate(topRunSplitRow);
    expect(split, "fixture must give a heading plus a body run").not.toBeNull();
    const band: [number, number] = [0, split!.row];

    const inkBefore = await settledInk(page, { band });
    const boxBefore = await page.evaluate(
      overlayInCanvasPx,
      "pdf-editor-run-p0-t0",
    );
    expect(inkBefore.n, "heading must be inked").toBeGreaterThan(300);
    expect(boxBefore, "heading overlay must exist").not.toBeNull();

    await setSize(page, 26);
    const inkAfter = await settledInk(page, { band, differentFrom: inkBefore });
    const boxAfter = await page.evaluate(
      overlayInCanvasPx,
      "pdf-editor-run-p0-t0",
    );
    expect(boxAfter).not.toBeNull();

    // 1. The ink still lives inside the box that claims to own it.
    expect(
      inkAfter.minX >= boxAfter!.left - 6 &&
        inkAfter.maxX <= boxAfter!.right + 6 &&
        inkAfter.minY >= boxAfter!.top - 6 &&
        inkAfter.maxY <= boxAfter!.bottom + 6,
      `resized ink ${inkKey(inkAfter)} must sit inside overlay ` +
        `${JSON.stringify(boxAfter)}`,
    ).toBe(true);

    // 2. The box grew by about as much as the ink did.
    const inkRatio = inkW(inkAfter) / inkW(inkBefore);
    const boxRatio =
      (boxAfter!.right - boxAfter!.left) / (boxBefore!.right - boxBefore!.left);
    expect(
      inkRatio,
      `precondition: 18pt -> 26pt must widen the ink, ${inkW(inkBefore)} -> ${inkW(inkAfter)}`,
    ).toBeGreaterThan(1.2);
    expect(
      Math.abs(boxRatio - inkRatio),
      `overlay grew ${boxRatio.toFixed(3)}x while its ink grew ${inkRatio.toFixed(3)}x`,
    ).toBeLessThan(0.25);
  });

  // Would catch: a resize whose command scope leaks past the selected run - the
  // untouched paragraph's pixels would shift or rescale too.
  test("resizing the heading leaves the body paragraph's pixels untouched", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH);

    const split = await page.evaluate(topRunSplitRow);
    expect(split, "fixture must give a heading plus a body run").not.toBeNull();
    const headBand: [number, number] = [0, split!.row];
    const bodyBand: [number, number] = [split!.row, split!.canvasH];

    const headBefore = await settledInk(page, { band: headBand });
    const bodyBefore = await settledInk(page, { band: bodyBand });
    expect(headBefore.n, "heading must be inked").toBeGreaterThan(300);
    expect(
      bodyBefore.n,
      "body paragraph must be inked, or 'unchanged' is vacuous",
    ).toBeGreaterThan(2000);

    await selectRun(page, "pdf-editor-run-p0-t0");
    await setSize(page, 26);
    const headAfter = await settledInk(page, {
      band: headBand,
      differentFrom: headBefore,
    });
    expect(
      inkW(headAfter) / inkW(headBefore),
      `precondition: the heading itself must have grown, ${inkW(headBefore)} -> ${inkW(headAfter)}`,
    ).toBeGreaterThan(1.2);

    const bodyAfter = await settledInk(page, { band: bodyBand });
    expect(
      inkKey(bodyAfter),
      "the body paragraph's pixels must be byte-identical after a heading-only resize",
    ).toBe(inkKey(bodyBefore));
  });
});

test.describe("PDF text editor - font family, measured on the rendered page", () => {
  // Would catch: a family swap that never reaches PDFium (identical bitmap), or
  // one that re-lays the line out from a new origin (baseline would move).
  test("Courier paints the same text wider than Helvetica on the same baseline", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, CONTROL);

    await selectRun(page, "pdf-editor-run-p0-t0");
    await setFamily(page, "Helvetica");
    const helvetica = await settledInk(page);
    expect(helvetica.n, "Helvetica render must be inked").toBeGreaterThan(100);

    await setFamily(page, "Courier");
    const courier = await settledInk(page, { differentFrom: helvetica });
    expect(courier.n, "Courier render must be inked").toBeGreaterThan(100);

    expect(
      courier.maxY,
      `a family swap must not move the baseline: ${helvetica.maxY} -> ${courier.maxY}`,
    ).toBe(helvetica.maxY);
    expect(
      Math.abs(courier.minX - helvetica.minX),
      `the text still starts at the same x: ${helvetica.minX} -> ${courier.minX}`,
    ).toBeLessThanOrEqual(4);
    expect(
      inkW(courier) / inkW(helvetica),
      `Courier is monospaced, so 'Hi' must be wider than in Helvetica: ` +
        `${inkW(helvetica)} -> ${inkW(courier)} px`,
    ).toBeGreaterThan(1.15);
  });

  // Would catch: a weight change that only relabels the font in the store. The
  // glyph box barely moves between Helvetica and Helvetica Bold, so the only
  // honest evidence is how much darker the stems are - the ink area.
  test("Helvetica Bold thickens the glyph ink without moving its box", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, CONTROL);

    await selectRun(page, "pdf-editor-run-p0-t0");
    await setFamily(page, "Helvetica");
    const regular = await settledInk(page);
    expect(regular.n, "regular render must be inked").toBeGreaterThan(100);

    await setFamily(page, "Helvetica Bold");
    const bold = await settledInk(page, { differentFrom: regular });

    expect(
      bold.n / regular.n,
      `bold stems must lay down materially more ink: ${regular.n} -> ${bold.n} px`,
    ).toBeGreaterThan(1.35);
    expect(
      bold.maxY,
      `bold must share the baseline: ${regular.maxY} -> ${bold.maxY}`,
    ).toBe(regular.maxY);
    expect(
      Math.abs(inkH(bold) - inkH(regular)),
      `bold must share the cap height: ${inkH(regular)} -> ${inkH(bold)} px`,
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(inkW(bold) - inkW(regular)),
      `bold's advance is close to regular's, the box should barely move: ` +
        `${inkW(regular)} -> ${inkW(bold)} px`,
    ).toBeLessThanOrEqual(8);
  });
});
