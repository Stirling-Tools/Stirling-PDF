import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import {
  downloadBytes,
  saveAndDownload,
  stashCurrentDocument,
  waitForReopenedPage,
} from "@app/tests/stubbed/v2SaveHelpers";

// Save round-trip fidelity, judged on PIXELS.
//
// The overlay paints no glyphs of its own (see the edit-mask spec), so the
// canvas before a save is a faithful picture of the in-memory document: save,
// feed the bytes back in, and the re-rendered bitmap must match. A dropped
// glyph, a ghost of deleted text or a shifted page shows up as ink.
//
// Every comparison is `getImageData` on the page canvas. The round-trip
// measures pixel-EXACT (ratios 0.0000) while the edits move the profiles
// 3-23%, so the thresholds sit several times tighter than the edit signal.

const FIX = (n: string) =>
  path.join(import.meta.dirname, "../test-fixtures", n);

/**
 * One page's rendered ink, reduced to profiles we can compare numerically.
 * `rows[y]` / `cols[x]` are dark-pixel counts; `mins`/`maxs` are the leftmost
 * and rightmost inked column on row y (-1 when the row is blank).
 */
interface Scan {
  width: number;
  height: number;
  ink: number;
  rows: number[];
  cols: number[];
  mins: number[];
  maxs: number[];
}

/**
 * Dark pixels on the PDFium bitmap for `v2-page-<idx>`. A page being
 * (re-)rendered momentarily carries a 0x0 canvas, so pick a sized one.
 */
const SCAN_FN = (idx: number): Scan | { err: string } => {
  const el = document.querySelector<HTMLElement>(
    `[data-testid="v2-page-${idx}"]`,
  );
  if (!el) return { err: `page ${idx} not mounted` };
  const canvas =
    Array.from(el.querySelectorAll("canvas")).find(
      (c) => c.width > 0 && c.height > 0,
    ) ?? null;
  if (!canvas) return { err: `page ${idx} has no sized canvas yet` };
  const ctx = canvas.getContext("2d");
  if (!ctx) return { err: "no 2d context" };
  const { width, height } = canvas;
  const d = ctx.getImageData(0, 0, width, height).data;
  const rows = new Array<number>(height).fill(0);
  const cols = new Array<number>(width).fill(0);
  const mins = new Array<number>(height).fill(-1);
  const maxs = new Array<number>(height).fill(-1);
  let ink = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      // "ink" = a dark pixel on a light page.
      if (d[o] < 160 && d[o + 1] < 160) {
        ink++;
        rows[y]++;
        cols[x]++;
        if (mins[y] < 0) mins[y] = x;
        maxs[y] = x;
      }
    }
  }
  return { width, height, ink, rows, cols, mins, maxs };
};

async function scan(page: Page, idx = 0): Promise<Scan> {
  const s = (await page.evaluate(SCAN_FN, idx)) as Scan | { err: string };
  if ("err" in s) throw new Error(`scan(page ${idx}) failed: ${s.err}`);
  return s;
}

/**
 * Wait until the page bitmap stops changing (the engine re-renders
 * asynchronously after an edit or a reload), then return the settled scan.
 */
async function settled(page: Page, idx = 0, tries = 60): Promise<Scan> {
  let prev = -1;
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    const ink = (await page.evaluate((j: number) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-page-${j}"]`,
      );
      const c =
        Array.from(el?.querySelectorAll("canvas") ?? []).find(
          (n) => n.width > 0 && n.height > 0,
        ) ?? null;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return -1;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let k = 0; k < d.length; k += 4)
        if (d[k] < 160 && d[k + 1] < 160) n++;
      return n;
    }, idx)) as number;
    if (ink > 0 && ink === prev) {
      stable++;
      if (stable >= 2) return scan(page, idx);
    } else {
      stable = 0;
    }
    prev = ink;
    await page.waitForTimeout(280);
  }
  throw new Error(`page ${idx} bitmap never settled (last ink=${prev})`);
}

// A blank 10x10 corner on every fixture used here (their ink starts at x>=45,
// y>=40). Painting it black before the reopen proves the bitmap we measure
// afterwards was genuinely repainted and is not the pre-save one still on
// screen - without this a "matches pre-save" assertion could pass vacuously.
const STAMP = { x: 0, y: 0, w: 10, h: 10 };

async function stampCanvases(page: Page): Promise<number> {
  const n = await page.evaluate((box) => {
    let count = 0;
    document.querySelectorAll('[data-testid^="v2-page-"]').forEach((el) => {
      el.querySelectorAll("canvas").forEach((c) => {
        if (c.width === 0 || c.height === 0) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#000000";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        count++;
      });
    });
    return count;
  }, STAMP);
  expect(n, "no sized canvas to stamp before the reopen").toBeGreaterThan(0);
  return n;
}

async function waitRepainted(page: Page, idx: number) {
  await page.waitForFunction(
    ({ i, box }: { i: number; box: typeof STAMP }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-page-${i}"]`,
      );
      const c =
        Array.from(el?.querySelectorAll("canvas") ?? []).find(
          (n) => n.width > 0 && n.height > 0,
        ) ?? null;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return false;
      const d = ctx.getImageData(box.x, box.y, box.w, box.h).data;
      for (let k = 0; k < d.length; k += 4)
        if (d[k] < 160 && d[k + 1] < 160) return false;
      return true;
    },
    { i: idx, box: STAMP },
    { timeout: 45_000 },
  );
}

interface Band {
  y0: number;
  y1: number;
  ink: number;
  x0: number;
  x1: number;
}

/** Contiguous runs of inked rows: one band per rendered text line. */
function bands(s: Scan): Band[] {
  const out: Band[] = [];
  let cur: Band | null = null;
  for (let y = 0; y < s.height; y++) {
    if (s.rows[y] > 0) {
      if (!cur) cur = { y0: y, y1: y, ink: 0, x0: s.width, x1: -1 };
      cur.y1 = y;
      cur.ink += s.rows[y];
      cur.x0 = Math.min(cur.x0, s.mins[y]);
      cur.x1 = Math.max(cur.x1, s.maxs[y]);
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Ink metrics inside a FIXED row window, so a band may legitimately empty. */
function inWindow(s: Scan, y0: number, y1: number): Band {
  const b: Band = { y0, y1, ink: 0, x0: s.width, x1: -1 };
  for (let y = Math.max(0, y0); y <= Math.min(s.height - 1, y1); y++) {
    b.ink += s.rows[y];
    if (s.mins[y] >= 0) {
      b.x0 = Math.min(b.x0, s.mins[y]);
      b.x1 = Math.max(b.x1, s.maxs[y]);
    }
  }
  return b;
}

/** Total-variation distance between two profiles, as a fraction of a's mass. */
function tv(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  let diff = 0;
  let mass = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    diff += Math.abs(av - bv);
    mass += av;
  }
  return diff / Math.max(mass, 1);
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(b, 1);

async function openEditor(page: Page, file: string, pageIdx = 0) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(FIX(file));
  await expect(page.getByTestId(`v2-page-${pageIdx}`)).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(600);
  return settled(page, pageIdx);
}

/** Put the caret at the end of a run and insert text through the DOM. */
async function typeAtEnd(page: Page, runId: string, text: string) {
  await page.evaluate(
    ({ id, t }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${id}"]`,
      );
      if (!el) throw new Error(`run ${id} not in DOM`);
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no Selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, t);
    },
    { id: runId, t: text },
  );
}

async function caretToEnd(page: Page, runId: string) {
  await page.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="v2-run-${id}"]`,
    );
    if (!el) throw new Error(`run ${id} not in DOM`);
    el.focus();
    const sel = window.getSelection();
    if (!sel) throw new Error("no Selection api");
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, runId);
}

interface RunInfo {
  id: string;
  text: string;
}

async function runsOn(page: Page, pageIdx: number): Promise<RunInfo[]> {
  return page.evaluate((i: number) => {
    const s = (
      window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      }
    ).__v2_editor_store;
    return (s.state.pages[i]?.runs ?? []).map((r) => ({
      id: r.id,
      text: r.text,
    }));
  }, pageIdx);
}

/**
 * Save, then feed the downloaded bytes straight back into the editor, and only
 * return once the canvas for `pageIdx` has actually been repainted.
 */
async function saveAndReopen(page: Page, pageIdx = 0): Promise<number> {
  const download = await saveAndDownload(page, false);
  const buffer = await downloadBytes(download);
  expect(
    buffer.subarray(0, 5).toString("latin1"),
    "the download is not a PDF",
  ).toBe("%PDF-");
  expect(buffer.length, "saved PDF is a stub").toBeGreaterThan(500);
  // Absorb any repaint the save itself triggers before we stamp.
  await settled(page, pageIdx);
  await stashCurrentDocument(page);
  await stampCanvases(page);
  await page.locator('[data-testid="v2-file-input"]').setInputFiles({
    name: "round-trip.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  await waitForReopenedPage(page, pageIdx, 60_000);
  await waitRepainted(page, pageIdx);
  return buffer.length;
}

test.describe("v2 editor - save round-trip fidelity (pixels)", () => {
  // Would catch: a save that drops the appended glyphs, reflows the paragraph,
  // or nudges the text block, while the pre-save screen looked correct.
  // Edit signal: rowTV/colTV ~0.049; round-trip must stay under 0.012.
  test("an appended word round-trips: the reopened bitmap matches the pre-save bitmap row for row", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const loaded = await openEditor(page, "paragraph-sample.pdf");
    expect(loaded.ink, "fixture rendered no ink at all").toBeGreaterThan(2000);

    const runs = await runsOn(page, 0);
    const body = runs.find((r) => r.text.length > 40);
    expect(body, "paragraph-sample has no long body run").toBeTruthy();

    await typeAtEnd(page, body!.id, " ROUNDTRIP");
    const preSave = await settled(page);

    // Non-vacuous guard: the edit must actually have changed the bitmap, and by
    // more than the tolerances below, or "unchanged after save" proves nothing.
    expect(
      preSave.ink - loaded.ink,
      `typing " ROUNDTRIP" added no ink (loaded=${loaded.ink}, edited=${preSave.ink})`,
    ).toBeGreaterThan(150);
    expect(
      tv(loaded.rows, preSave.rows),
      "the row profile cannot even see the edit, so it cannot police the save",
    ).toBeGreaterThan(0.02);

    await saveAndReopen(page);
    const after = await settled(page);

    expect(after.width, "canvas width changed across the round-trip").toBe(
      preSave.width,
    );
    expect(
      rel(after.ink, preSave.ink),
      `ink drifted: pre-save=${preSave.ink} reopened=${after.ink}`,
    ).toBeLessThan(0.006);
    expect(
      tv(preSave.rows, after.rows),
      "row ink profile moved: text shifted vertically across the save",
    ).toBeLessThan(0.012);
    expect(
      tv(preSave.cols, after.cols),
      "column ink profile moved: text shifted horizontally across the save",
    ).toBeLessThan(0.012);
  });

  // Would catch: the generator leaving the ORIGINAL glyphs behind (ghost text)
  // so deleted characters come back as ink once the file is reopened.
  test("backspaced glyphs stay gone: the reopened page has no resurrected ink at the line's old right edge", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const loaded = await openEditor(page, "paragraph-sample.pdf");
    const lines = bands(loaded);
    expect(lines.length, "expected several rendered lines").toBeGreaterThan(3);
    const last = lines[lines.length - 1];

    const runs = await runsOn(page, 0);
    const body = runs.find((r) => r.text.length > 40);
    expect(body, "paragraph-sample has no long body run").toBeTruthy();
    await caretToEnd(page, body!.id);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(60);
    }
    const preSave = await settled(page);
    const preLast = inWindow(preSave, last.y0, last.y1);

    // Non-vacuous guard: the deletion must have visibly shortened the line.
    expect(
      last.x1 - preLast.x1,
      `12 backspaces did not pull the last line's right edge in (was x1=${last.x1}, now ${preLast.x1})`,
    ).toBeGreaterThan(20);

    await saveAndReopen(page);
    const after = await settled(page);
    const afterLast = inWindow(after, last.y0, last.y1);

    expect(
      afterLast.x1,
      `deleted glyphs came back: last line reaches x=${afterLast.x1} after reopen but only x=${preLast.x1} before the save`,
    ).toBeLessThanOrEqual(preLast.x1 + 2);
    expect(
      rel(afterLast.ink, preLast.ink),
      `last line ink changed across the save (pre=${preLast.ink} post=${afterLast.ink})`,
    ).toBeLessThan(0.02);
    expect(
      after.ink,
      `the whole page regained ink after the save (loaded=${loaded.ink}, pre-save=${preSave.ink}, reopened=${after.ink})`,
    ).toBeLessThan(loaded.ink - 100);
  });

  // Would catch: an edit serialising onto the wrong page, or a save that
  // regenerates untouched pages and shifts their content.
  // Edit signal on page 6: colTV ~0.23; round-trip must stay under 0.02.
  test("an edit on page 6 of 8 round-trips while page 1's bitmap is left bit-for-bit alone", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const page0Loaded = await openEditor(page, "many-pages-sample.pdf");

    await page.getByTestId("v2-page-5").scrollIntoViewIfNeeded();
    const page5Loaded = await settled(page, 5);
    const runs5 = await runsOn(page, 5);
    expect(runs5.length, "page index 5 has no runs").toBeGreaterThan(0);

    await typeAtEnd(page, runs5[0].id, " EDIT");
    const page5Pre = await settled(page, 5);
    expect(
      page5Pre.ink - page5Loaded.ink,
      "typing on page index 5 added no ink",
    ).toBeGreaterThan(60);
    expect(
      tv(page5Loaded.cols, page5Pre.cols),
      "the column profile cannot see the page-6 edit",
    ).toBeGreaterThan(0.05);

    // Scroll back before saving: page 0 is virtualised away while page 6 is on
    // screen, and the round-trip is measured on both.
    await page.getByTestId("v2-page-0").scrollIntoViewIfNeeded();
    await settled(page, 0);
    await saveAndReopen(page, 0);
    const page0After = await settled(page, 0);
    await page.getByTestId("v2-page-5").scrollIntoViewIfNeeded();
    const page5After = await settled(page, 5);

    expect(
      rel(page0After.ink, page0Loaded.ink),
      `untouched page 1 changed: ${page0Loaded.ink} -> ${page0After.ink}`,
    ).toBeLessThan(0.006);
    expect(
      tv(page0Loaded.rows, page0After.rows),
      "untouched page 1's lines moved across the save",
    ).toBeLessThan(0.012);
    expect(
      rel(page5After.ink, page5Pre.ink),
      `edited page 6 lost ink across the save: ${page5Pre.ink} -> ${page5After.ink}`,
    ).toBeLessThan(0.006);
    expect(
      tv(page5Pre.cols, page5After.cols),
      "edited page 6's text moved horizontally across the save",
    ).toBeLessThan(0.02);
  });

  // Would catch: a regeneration that is not idempotent - font re-embedding or
  // matrix rounding that nudges glyphs a little further on every save.
  test("three no-edit save cycles do not drift the rendered page by a single ink row", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const original = await openEditor(page, "paragraph-sample.pdf");
    expect(original.ink, "fixture rendered no ink").toBeGreaterThan(2000);
    const firstBands = bands(original);
    expect(firstBands.length, "expected multiple text lines").toBeGreaterThan(
      3,
    );

    for (let cycle = 1; cycle <= 3; cycle++) {
      const size = await saveAndReopen(page);
      expect(size, `cycle ${cycle} produced a stub PDF`).toBeGreaterThan(500);
      const after = await settled(page);
      expect(
        rel(after.ink, original.ink),
        `cycle ${cycle}: ink drifted from ${original.ink} to ${after.ink}`,
      ).toBeLessThan(0.008);
      expect(
        tv(original.rows, after.rows),
        `cycle ${cycle}: the page's lines moved vertically`,
      ).toBeLessThan(0.012);
      const nowBands = bands(after);
      expect(
        nowBands.length,
        `cycle ${cycle}: line count changed (${firstBands.length} -> ${nowBands.length})`,
      ).toBe(firstBands.length);
      for (let i = 0; i < firstBands.length; i++) {
        expect(
          Math.abs(nowBands[i].y0 - firstBands[i].y0),
          `cycle ${cycle}: line ${i} moved from y=${firstBands[i].y0} to y=${nowBands[i].y0}`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(nowBands[i].x1 - firstBands[i].x1),
          `cycle ${cycle}: line ${i} right edge moved ${firstBands[i].x1} -> ${nowBands[i].x1}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  // Would catch: justification offsets collapsing to natural spacing on save -
  // the lines would keep their words but lose their flush right edge.
  test("a justified paragraph keeps each line's left and right ink extents through save and reopen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const loaded = await openEditor(page, "justified-sample.pdf");
    const lines = bands(loaded);
    expect(
      lines.length,
      `justified-sample should render 3 lines, got ${lines.length}`,
    ).toBeGreaterThanOrEqual(3);

    const runs = await runsOn(page, 0);
    expect(runs.length, "justified-sample has no runs").toBeGreaterThan(0);
    await typeAtEnd(page, runs[0].id, "!!!");
    const preSave = await settled(page);
    const preLines = bands(preSave);
    expect(
      preLines.length,
      "the edit changed the line count before saving",
    ).toBe(lines.length);
    // Non-vacuous guard: per-line x extents must be able to see an edit.
    const widened = Math.max(
      ...preLines.map((b, i) => Math.abs(b.x1 - lines[i].x1)),
    );
    expect(
      widened,
      `appending "!!!" moved no line's right edge (max delta ${widened}px)`,
    ).toBeGreaterThanOrEqual(5);

    await saveAndReopen(page);
    const after = await settled(page);
    const postLines = bands(after);

    expect(
      postLines.length,
      `line count changed across the save: ${preLines.length} -> ${postLines.length}`,
    ).toBe(preLines.length);
    for (let i = 0; i < preLines.length; i++) {
      expect(
        Math.abs(postLines[i].x0 - preLines[i].x0),
        `line ${i} left edge moved ${preLines[i].x0} -> ${postLines[i].x0}`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(postLines[i].x1 - preLines[i].x1),
        `line ${i} right edge moved ${preLines[i].x1} -> ${postLines[i].x1} (justification lost?)`,
      ).toBeLessThanOrEqual(1);
      expect(
        rel(postLines[i].ink, preLines[i].ink),
        `line ${i} ink changed ${preLines[i].ink} -> ${postLines[i].ink}`,
      ).toBeLessThan(0.02);
    }
  });

  // Would catch: the edited run's subset font failing to re-embed, so the
  // reopened file paints blanks or fallback tofu instead of the same glyphs.
  test("an embedded subset font still paints the same glyph ink after the round-trip", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const loaded = await openEditor(page, "subset-font-sample.pdf");
    const loadedLines = bands(loaded);
    expect(
      loadedLines.length,
      "subset fixture rendered no lines",
    ).toBeGreaterThan(1);

    const runs = await runsOn(page, 0);
    const target = runs.find((r) => r.text.length > 10);
    expect(target, "no long run in the subset fixture").toBeTruthy();
    await typeAtEnd(page, target!.id, "nnn");
    const preSave = await settled(page);
    const preLines = bands(preSave);
    expect(
      preSave.ink - loaded.ink,
      `typing "nnn" into the subset run added no ink (${loaded.ink} -> ${preSave.ink})`,
    ).toBeGreaterThan(30);
    expect(
      tv(loaded.rows, preSave.rows),
      "the row profile cannot see the subset-font edit",
    ).toBeGreaterThan(0.015);

    await saveAndReopen(page);
    const after = await settled(page);
    const postLines = bands(after);

    expect(
      postLines.length,
      `line count changed across the save (${preLines.length} -> ${postLines.length}): a line stopped painting`,
    ).toBe(preLines.length);
    expect(
      rel(after.ink, preSave.ink),
      `subset glyph ink changed across the save: ${preSave.ink} -> ${after.ink}`,
    ).toBeLessThan(0.008);
    expect(
      tv(preSave.rows, after.rows),
      "subset text moved vertically across the save",
    ).toBeLessThan(0.012);
  });

  // Would catch: the stroke render mode never reaching the content stream, so
  // the reopened page shows plain fill-only glyphs again.
  test("a glyph outline survives serialisation: the thickened ink is still there after reopen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const loaded = await openEditor(page, "paragraph-sample.pdf");

    await page.locator('[data-testid^="v2-run-p0-"]').first().click();
    await page.waitForTimeout(300);
    await page.getByTestId("v2-colour-advanced").click();
    const width = page.getByTestId("v2-outline-width");
    await expect(width).toBeVisible();
    await width.fill("1.5");
    await width.press("Enter");
    await page.keyboard.press("Escape");
    const preSave = await settled(page);

    // Non-vacuous guard: the outline must have thickened the ink on screen.
    expect(
      preSave.ink - loaded.ink,
      `outline width 1.5 did not thicken the glyphs (${loaded.ink} -> ${preSave.ink})`,
    ).toBeGreaterThan(500);

    await saveAndReopen(page);
    const after = await settled(page);

    expect(
      after.ink,
      `outline was dropped by the save: reopened ink ${after.ink} is back near the un-outlined ${loaded.ink}`,
    ).toBeGreaterThan(loaded.ink + 400);
    expect(
      rel(after.ink, preSave.ink),
      `outlined ink changed across the save: ${preSave.ink} -> ${after.ink}`,
    ).toBeLessThan(0.01);
  });

  // Would catch: a deleted run being written back out anyway, or the delete
  // taking neighbouring lines with it once the file is regenerated.
  test("a run deleted from the toolbar leaves its rows blank after reopen and spares the lines below", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const loaded = await openEditor(page, "paragraph-sample.pdf");
    const lines = bands(loaded);
    expect(lines.length, "expected a heading plus body lines").toBeGreaterThan(
      2,
    );
    const heading = lines[0];
    expect(heading.ink, "the heading line has no ink").toBeGreaterThan(300);
    const bodyTop = lines[1].y0;
    const bodyBottom = lines[lines.length - 1].y1;
    const bodyLoaded = inWindow(loaded, bodyTop, bodyBottom);

    await page.locator('[data-testid^="v2-run-p0-"]').first().click();
    await page.waitForTimeout(300);
    await page.getByTestId("v2-delete").click();
    const preSave = await settled(page);
    const headPre = inWindow(preSave, heading.y0, heading.y1);
    expect(
      headPre.ink,
      `deleting the heading left ${headPre.ink} ink pixels in its rows`,
    ).toBeLessThan(heading.ink * 0.05);

    await saveAndReopen(page);
    const after = await settled(page);
    const headPost = inWindow(after, heading.y0, heading.y1);
    const bodyPost = inWindow(after, bodyTop, bodyBottom);

    expect(
      headPost.ink,
      `the deleted heading came back as ${headPost.ink} ink pixels (was ${heading.ink} before deletion)`,
    ).toBeLessThan(heading.ink * 0.05);
    expect(
      rel(bodyPost.ink, bodyLoaded.ink),
      `deleting the heading disturbed the body text: ${bodyLoaded.ink} -> ${bodyPost.ink}`,
    ).toBeLessThan(0.01);
    expect(
      Math.abs(bodyPost.x0 - bodyLoaded.x0),
      `body text left margin moved ${bodyLoaded.x0} -> ${bodyPost.x0}`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(bodyPost.x1 - bodyLoaded.x1),
      `body text right margin moved ${bodyLoaded.x1} -> ${bodyPost.x1}`,
    ).toBeLessThanOrEqual(1);
  });

  // Would catch: only the last edit reaching the saved bytes, which still looks
  // right on screen because the overlay model holds both.
  test("two edits in different lines both survive one save: each line band matches its pre-save ink", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const loaded = await openEditor(page, "paragraph-sample.pdf");
    const lines = bands(loaded);
    expect(lines.length, "expected a heading plus body lines").toBeGreaterThan(
      2,
    );
    const headWin = { y0: lines[0].y0, y1: lines[0].y1 };
    const lastWin = {
      y0: lines[lines.length - 1].y0,
      y1: lines[lines.length - 1].y1,
    };

    const runs = await runsOn(page, 0);
    const heading = runs.find((r) => r.text.length <= 40 && r.text.length > 2);
    const body = runs.find((r) => r.text.length > 40);
    expect(heading, "no heading run").toBeTruthy();
    expect(body, "no body run").toBeTruthy();

    await typeAtEnd(page, heading!.id, " AAA");
    await page.waitForTimeout(400);
    await typeAtEnd(page, body!.id, " BBB");
    const preSave = await settled(page);

    const headPre = inWindow(preSave, headWin.y0, headWin.y1);
    const lastPre = inWindow(preSave, lastWin.y0, lastWin.y1);
    const headLoaded = inWindow(loaded, headWin.y0, headWin.y1);
    const lastLoaded = inWindow(loaded, lastWin.y0, lastWin.y1);
    // Non-vacuous guard: both edits must be visible on the pre-save bitmap.
    expect(
      headPre.x1 - headLoaded.x1,
      `" AAA" did not widen the heading line (x1 ${headLoaded.x1} -> ${headPre.x1})`,
    ).toBeGreaterThan(15);
    expect(
      lastPre.x1 - lastLoaded.x1,
      `" BBB" did not widen the last body line (x1 ${lastLoaded.x1} -> ${lastPre.x1})`,
    ).toBeGreaterThan(15);

    await saveAndReopen(page);
    const after = await settled(page);
    const headPost = inWindow(after, headWin.y0, headWin.y1);
    const lastPost = inWindow(after, lastWin.y0, lastWin.y1);

    expect(
      Math.abs(headPost.x1 - headPre.x1),
      `heading edit lost in the save: right edge ${headPre.x1} -> ${headPost.x1}`,
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(lastPost.x1 - lastPre.x1),
      `body edit lost in the save: right edge ${lastPre.x1} -> ${lastPost.x1}`,
    ).toBeLessThanOrEqual(2);
    expect(
      rel(headPost.ink, headPre.ink),
      `heading line ink changed ${headPre.ink} -> ${headPost.ink}`,
    ).toBeLessThan(0.02);
    expect(
      rel(lastPost.ink, lastPre.ink),
      `body line ink changed ${lastPre.ink} -> ${lastPost.ink}`,
    ).toBeLessThan(0.02);
  });

  // Would catch: a round-trip that only looks clean because the same tab still
  // holds the edited model. A cold mount renders purely from the saved bytes.
  test("the saved bytes render identically in a cold editor session, not just in the session that wrote them", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const loaded = await openEditor(page, "paragraph-sample.pdf");
    const runs = await runsOn(page, 0);
    const body = runs.find((r) => r.text.length > 40);
    expect(body, "no body run to edit").toBeTruthy();
    await typeAtEnd(page, body!.id, " COLDSTART");
    const preSave = await settled(page);
    expect(
      preSave.ink - loaded.ink,
      "the marker text added no ink before saving",
    ).toBeGreaterThan(150);
    expect(
      tv(loaded.cols, preSave.cols),
      "the column profile cannot see the edit",
    ).toBeGreaterThan(0.02);

    const download = await saveAndDownload(page, false);
    const buffer = await downloadBytes(download);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Cold mount: brand-new editor, then open only the saved bytes.
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
    await stashCurrentDocument(page);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "cold-start.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 60_000,
    });
    await waitForReopenedPage(page, 0, 60_000);
    const cold = await settled(page);

    const coldText = (await runsOn(page, 0)).map((r) => r.text).join(" ");
    expect(
      coldText,
      "the cold session did not load the edited bytes",
    ).toContain("COLDSTART");
    expect(cold.width, "cold render used a different canvas size").toBe(
      preSave.width,
    );
    expect(
      rel(cold.ink, preSave.ink),
      `cold render ink differs: pre-save=${preSave.ink} cold=${cold.ink}`,
    ).toBeLessThan(0.006);
    expect(
      tv(preSave.rows, cold.rows),
      "cold render put the lines on different rows",
    ).toBeLessThan(0.012);
    expect(
      tv(preSave.cols, cold.cols),
      "cold render put the text at different columns",
    ).toBeLessThan(0.012);
  });
});
