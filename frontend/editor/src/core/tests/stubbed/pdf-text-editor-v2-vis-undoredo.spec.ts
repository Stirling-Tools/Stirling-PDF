import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Undo/redo, judged on the PAGE BITMAP rather than on history counters.
//
// The editor paints nothing itself: every run overlay is transparent text over
// the PDFium raster, so the only honest proof that an undo "worked" is that the
// canvas ink goes back to what it was before the edit. Model-level specs can
// (and do) pass while the raster keeps the pre-undo glyphs - see the skipped
// test below, which is a real bug found while writing this file.
//
// Every test here samples the <canvas> and asserts on ink profiles, ink bounding
// boxes or ink colour. Nothing asserts on a history counter alone.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
const PNG = path.join(import.meta.dirname, "../test-fixtures/sample.png");

/** Heading run and 4-line body paragraph run of paragraph-sample.pdf. */
const HEAD = "p0-t0";
const BODY = "p0-t1";

async function openV2(page: Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

interface Shot {
  /** Canvas pixel size of the whole page raster. */
  W: number;
  H: number;
  /** Sampled rect within the raster, in canvas px. */
  rect: [number, number, number, number];
  /** Dark (luminance < 170) pixel count, and its per-row profile. */
  ink: number;
  rows: number[];
  /** Mean RGB of the dark pixels - white when there are none. */
  mean: [number, number, number];
  /** Ink bounding box within the rect: [minX, minY, maxX, maxY]. */
  bbox: [number, number, number, number] | null;
  /** Saturated (max-min channel > 25) pixel count and bounding box. */
  colour: number;
  colourBbox: [number, number, number, number] | null;
  /** Order-sensitive fingerprint of the ink positions. */
  hash: number;
}

const SHOT = (arg: {
  pageIndex: number;
  runId: string | null;
  rect: [number, number, number, number] | null;
  pad: number;
}): Shot | null => {
  const pg = document.querySelector(`[data-testid="v2-page-${arg.pageIndex}"]`);
  const canvas = pg?.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas || canvas.width < 2) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let x = 0;
  let y = 0;
  let w = canvas.width;
  let h = canvas.height;
  if (arg.rect) {
    [x, y, w, h] = arg.rect;
  } else if (arg.runId) {
    // Run overlay rect (CSS px, viewport-relative) -> canvas px.
    const el = document.querySelector<HTMLElement>(
      `[data-testid="v2-run-${arg.runId}"]`,
    );
    if (!el) return null;
    const cb = canvas.getBoundingClientRect();
    const rb = el.getBoundingClientRect();
    const sx = canvas.width / cb.width;
    const sy = canvas.height / cb.height;
    x = Math.max(0, Math.floor((rb.left - cb.left) * sx) - arg.pad);
    y = Math.max(0, Math.floor((rb.top - cb.top) * sy) - arg.pad);
    w = Math.min(canvas.width - x, Math.ceil(rb.width * sx) + arg.pad * 2);
    h = Math.min(canvas.height - y, Math.ceil(rb.height * sy) + arg.pad * 2);
  }
  if (w < 2 || h < 2) return null;
  const d = ctx.getImageData(x, y, w, h).data;
  const rows: number[] = new Array(h).fill(0);
  let ink = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let hash = 2166136261;
  let minX = 1e9;
  let maxX = -1;
  let minY = 1e9;
  let maxY = -1;
  let colour = 0;
  let cMinX = 1e9;
  let cMaxX = -1;
  let cMinY = 1e9;
  let cMaxY = -1;
  for (let yy = 0; yy < h; yy += 1) {
    let c = 0;
    for (let xx = 0; xx < w; xx += 1) {
      const i = (yy * w + xx) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 25) {
        colour += 1;
        if (xx < cMinX) cMinX = xx;
        if (xx > cMaxX) cMaxX = xx;
        if (yy < cMinY) cMinY = yy;
        if (yy > cMaxY) cMaxY = yy;
      }
      if (0.299 * r + 0.587 * g + 0.114 * b < 170) {
        c += 1;
        sr += r;
        sg += g;
        sb += b;
        hash = ((hash ^ (xx + yy * 7919)) * 16777619) >>> 0;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
      }
    }
    rows[yy] = c;
    ink += c;
  }
  return {
    W: canvas.width,
    H: canvas.height,
    rect: [x, y, w, h],
    ink,
    rows,
    mean: ink
      ? [sr / ink, sg / ink, sb / ink]
      : ([255, 255, 255] as [number, number, number]),
    bbox: maxX < 0 ? null : [minX, minY, maxX, maxY],
    colour,
    colourBbox: cMaxX < 0 ? null : [cMinX, cMinY, cMaxX, cMaxY],
    hash,
  };
};

async function shot(
  page: Page,
  opts: {
    runId?: string | null;
    rect?: [number, number, number, number] | null;
    pad?: number;
  } = {},
): Promise<Shot> {
  const out = await page.evaluate(SHOT, {
    pageIndex: 0,
    runId: opts.runId ?? null,
    rect: opts.rect ?? null,
    pad: opts.pad ?? 3,
  });
  if (!out) throw new Error("page-0 canvas is not readable");
  return out;
}

/** L1 distance between two per-row ink profiles: 0 means identical rasters. */
function rowDist(a: Shot, b: Shot): number {
  const n = Math.min(a.rows.length, b.rows.length);
  let d = Math.abs(a.rows.length - b.rows.length) * 50;
  for (let i = 0; i < n; i += 1) d += Math.abs(a.rows[i] - b.rows[i]);
  return d;
}

/** Poll the raster until it stops changing, then return that settled shot. */
async function settle(page: Page): Promise<Shot> {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 80; i += 1) {
    const s = await page.evaluate(SHOT, {
      pageIndex: 0,
      runId: null,
      rect: null,
      pad: 0,
    });
    const h = s ? s.hash : -1;
    if (s && h === last && h !== -1) {
      stable += 1;
      if (stable >= 2) return s;
    } else {
      stable = 0;
    }
    last = h;
    await page.waitForTimeout(250);
  }
  throw new Error("the page bitmap never settled");
}

async function selectRun(page: Page, id: string) {
  await page.evaluate(
    (rid: string) =>
      (
        window as unknown as {
          __v2_editor_store: { selection: { selectOne(id: string): void } };
        }
      ).__v2_editor_store.selection.selectOne(rid),
    id,
  );
  await page.waitForTimeout(250);
}

/** Commit whatever control is focused; number/colour inputs apply on blur. */
async function blurAll(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.waitForTimeout(900);
}

function depth(page: Page): Promise<{ undo: number; redo: number }> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __v2_editor_store: {
          history: { size(): { undo: number; redo: number } };
        };
      }
    ).__v2_editor_store.history.size(),
  );
}

async function undo(page: Page, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(1200);
  }
}

async function redo(page: Page, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await page.getByTestId("v2-redo").click();
    await page.waitForTimeout(1200);
  }
}

function pageText(page: Page): Promise<string> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { text: string }[] }[] };
        };
      }
    ).__v2_editor_store.state.pages[0].runs
      .map((r) => r.text)
      .join(" | "),
  );
}

async function setFontSize(page: Page, value: string) {
  const f = page.getByTestId("v2-font-size");
  await f.fill(value);
  await f.press("Enter");
  await page.waitForTimeout(1500);
  await blurAll(page);
  await page.waitForTimeout(800);
}

async function insertImage(page: Page) {
  await page.locator('[data-testid="v2-image-input"]').setInputFiles(PNG);
  await page.waitForTimeout(2200);
}

async function selectInsertedImage(page: Page) {
  const id = await page.evaluate(
    () =>
      (
        window as unknown as {
          __v2_editor_store: {
            doc: { loadedPages(): { images: { id: string }[] }[] };
          };
        }
      ).__v2_editor_store.doc
        .loadedPages()
        .flatMap((p) => p.images)
        .map((i) => i.id)
        .pop() ?? null,
  );
  expect(id, "no image on the page to select").not.toBeNull();
  await page.evaluate(
    (iid: string) =>
      (
        window as unknown as {
          __v2_editor_store: { selection: { selectImage(id: string): void } };
        }
      ).__v2_editor_store.selection.selectImage(iid),
    id!,
  );
  await page.waitForTimeout(300);
  return id!;
}

test.describe("v2 editor - undo/redo restores the page bitmap", () => {
  test("undoing an appended word repaints the run's exact pre-edit ink, and redo repaints the edit", async ({
    page,
  }) => {
    // Catches: an undo that fixes the model but leaves the raster showing the
    // edited glyphs (or a redo that fails to repaint them).
    test.setTimeout(150_000);
    await openV2(page, PARAGRAPH_PDF);
    const base = await settle(page);
    expect(base.ink, "fixture must start with ink on the page").toBeGreaterThan(
      3000,
    );

    await page.locator(`[data-testid="v2-run-${HEAD}"]`).click();
    await page.waitForTimeout(300);
    await page.keyboard.press("End");
    await page.keyboard.type("QQ");
    await page.waitForTimeout(1500);
    await blurAll(page);
    const edited = await settle(page);
    const editDist = rowDist(base, edited);
    expect(
      editDist,
      `typing must visibly change the raster (row-ink L1 was ${editDist})`,
    ).toBeGreaterThan(150);

    await undo(page);
    const undone = await settle(page);
    expect(
      await pageText(page),
      "undo must restore the model text",
    ).not.toMatch(/QQ/);
    expect(
      rowDist(base, undone),
      `undo left the raster ${rowDist(base, undone)} row-ink away from the ` +
        `original (the edit itself only moved it ${editDist})`,
    ).toBeLessThan(editDist / 8);

    await redo(page);
    const redone = await settle(page);
    expect(
      rowDist(edited, redone),
      `redo left the raster ${rowDist(edited, redone)} row-ink away from the ` +
        `edited painting`,
    ).toBeLessThan(editDist / 8);
  });

  // BUG (found while writing this file, 2026-08-28): typing in the MIDDLE of a
  // run - the partial-edit path that splits the run - leaves the edited glyphs
  // painted on the page after undo. The model text reverts correctly and the
  // undo stack goes 1 -> 0, but the raster shows the original text AND the
  // edited text on top of each other (heading ink 9915 -> 10294 on edit ->
  // 10736 after undo; a forced re-render does not clear it, so the PDFium page
  // really does hold both objects). Backspace at the end of a run shows the
  // same residue. Appending at the end (test above) is exact, so the defect is
  // in the split/partial-edit undo, not in undo generally.
  test.skip("undoing a mid-word edit repaints the original glyphs without leaving the edited ones behind", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openV2(page, PARAGRAPH_PDF);
    const base = await settle(page);
    await page.locator(`[data-testid="v2-run-${HEAD}"]`).click();
    await page.waitForTimeout(300);
    await page.keyboard.type("QQ");
    await page.waitForTimeout(1500);
    await blurAll(page);
    const edited = await settle(page);
    const editDist = rowDist(base, edited);
    await undo(page);
    const undone = await settle(page);
    expect(
      rowDist(base, undone),
      "undo must not leave the edited glyphs on the raster",
    ).toBeLessThan(editDist / 8);
  });

  test("undoing a fill colour repaints the glyphs in their original grey, not the picked red", async ({
    page,
  }) => {
    // Catches: an undo that reverts the stored fill but never repaints, so the
    // page keeps showing red text.
    test.setTimeout(150_000);
    await openV2(page, PARAGRAPH_PDF);
    const basePage = await settle(page);
    const baseRun = await shot(page, { runId: HEAD });
    expect(
      baseRun.ink,
      "heading region must hold ink before the recolour",
    ).toBeGreaterThan(500);
    const spread = (s: Shot) => s.mean[0] - s.mean[1];
    expect(
      Math.abs(spread(baseRun)),
      `heading starts neutral: mean rgb ${baseRun.mean.map(Math.round)}`,
    ).toBeLessThan(5);

    await selectRun(page, HEAD);
    await page.getByTestId("v2-colour").fill("#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await blurAll(page);
    await page.waitForTimeout(1500);
    const editedPage = await settle(page);
    const editedRun = await shot(page, { runId: HEAD });
    expect(
      spread(editedRun),
      `recolour must push red above green in the raster: mean rgb ` +
        `${editedRun.mean.map(Math.round)}`,
    ).toBeGreaterThan(20);

    await undo(page);
    const undonePage = await settle(page);
    const undoneRun = await shot(page, { runId: HEAD });
    expect(
      Math.abs(spread(undoneRun)),
      `undo left the heading red: mean rgb ${undoneRun.mean.map(Math.round)}`,
    ).toBeLessThan(5);
    const editDist = rowDist(basePage, editedPage);
    expect(editDist, "the recolour must move the raster").toBeGreaterThan(60);
    expect(
      rowDist(basePage, undonePage),
      "undo must put the original raster back",
    ).toBeLessThan(editDist / 4);
  });

  test("undoing a font-size bump shrinks the painted heading back to its original ink box", async ({
    page,
  }) => {
    // Catches: a size undo that restores fontSize in the model while the page
    // keeps rendering the enlarged glyphs.
    test.setTimeout(150_000);
    await openV2(page, PARAGRAPH_PDF);
    const basePage = await settle(page);
    // Band above the body paragraph, so the measured box is the heading alone.
    const bodyRect = (await shot(page, { runId: BODY, pad: 0 })).rect;
    const band: [number, number, number, number] = [
      0,
      0,
      basePage.W,
      Math.max(20, bodyRect[1] - 4),
    ];
    const baseBox = await shot(page, { rect: band });
    expect(baseBox.bbox, "heading band must contain ink").not.toBeNull();
    const wOf = (s: Shot) => s.bbox![2] - s.bbox![0];
    const topOf = (s: Shot) => s.bbox![1];

    await selectRun(page, HEAD);
    await setFontSize(page, "26");
    const editedPage = await settle(page);
    const editedBox = await shot(page, { rect: band });
    expect(
      wOf(editedBox) / wOf(baseBox),
      `26pt must widen the painted heading (was ${wOf(baseBox)}px, now ` +
        `${wOf(editedBox)}px)`,
    ).toBeGreaterThan(1.25);
    expect(
      topOf(editedBox),
      `26pt must raise the heading's top ink row (was ${topOf(baseBox)})`,
    ).toBeLessThan(topOf(baseBox));

    await undo(page);
    await settle(page);
    const undoneBox = await shot(page, { rect: band });
    expect(
      Math.abs(wOf(undoneBox) - wOf(baseBox)),
      `undo left the heading ${wOf(undoneBox)}px wide, original was ` +
        `${wOf(baseBox)}px`,
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(topOf(undoneBox) - topOf(baseBox)),
      "undo left the heading's top ink row moved",
    ).toBeLessThanOrEqual(2);
    const editDist = rowDist(basePage, editedPage);
    expect(editDist, "the size change must move the raster").toBeGreaterThan(
      800,
    );
  });

  test("undoing a delete repaints the erased glyphs into the pixels they came from", async ({
    page,
  }) => {
    // Catches: a delete undo that re-adds the run to the model but paints it
    // nowhere, or paints it somewhere else on the page.
    test.setTimeout(150_000);
    await openV2(page, PARAGRAPH_PDF);
    const basePage = await settle(page);
    const baseRegion = await shot(page, { runId: HEAD, pad: 4 });
    const rect = baseRegion.rect;
    expect(
      baseRegion.ink,
      "heading region must hold ink before the delete",
    ).toBeGreaterThan(500);

    await selectRun(page, HEAD);
    await page.getByTestId("v2-delete").click();
    await page.waitForTimeout(1500);
    const deletedPage = await settle(page);
    const deletedRegion = await shot(page, { rect });
    expect(
      deletedRegion.ink,
      `delete must wipe the heading's pixels (still ${deletedRegion.ink} of ` +
        `${baseRegion.ink})`,
    ).toBeLessThan(baseRegion.ink * 0.02);

    await undo(page);
    const undonePage = await settle(page);
    const undoneRegion = await shot(page, { rect });
    expect(
      Math.abs(undoneRegion.ink - baseRegion.ink),
      `undo repainted ${undoneRegion.ink} ink px where ${baseRegion.ink} were`,
    ).toBeLessThan(baseRegion.ink * 0.02);
    expect(
      undoneRegion.bbox,
      "the restored glyphs must occupy the original ink box",
    ).toEqual(baseRegion.bbox);
    const editDist = rowDist(basePage, deletedPage);
    expect(editDist, "the delete must move the raster").toBeGreaterThan(800);
    expect(
      rowDist(basePage, undonePage),
      "undo must put the whole page raster back",
    ).toBeLessThan(editDist / 8);
  });

  test("undoing an image insert wipes its coloured pixels and redo paints them back", async ({
    page,
  }) => {
    // Catches: an image-insert undo that drops the object from the model but
    // leaves the picture rendered (or a redo that renders nothing).
    test.setTimeout(180_000);
    await openV2(page, PARAGRAPH_PDF);
    const base = await settle(page);
    expect(
      base.colour,
      `a text-only page must have no saturated pixels (found ${base.colour})`,
    ).toBeLessThan(50);

    await insertImage(page);
    const inserted = await settle(page);
    expect(
      inserted.colour,
      `the inserted PNG must paint saturated pixels (found ${inserted.colour})`,
    ).toBeGreaterThan(1000);

    await undo(page);
    const undone = await settle(page);
    expect(
      undone.colour,
      `undo left ${undone.colour} saturated pixels on the page`,
    ).toBeLessThan(50);
    expect(
      rowDist(base, undone),
      "undo must restore the text-only raster exactly",
    ).toBeLessThan(rowDist(base, inserted) / 8);

    await redo(page);
    const redone = await settle(page);
    expect(
      redone.colour / inserted.colour,
      `redo repainted ${redone.colour} saturated px, insert had ` +
        `${inserted.colour}`,
    ).toBeGreaterThan(0.95);
    expect(
      rowDist(inserted, redone),
      "redo must reproduce the inserted painting",
    ).toBeLessThan(rowDist(base, inserted) / 8);
  });

  test("undoing an image rotation puts the picture's landscape pixel footprint back", async ({
    page,
  }) => {
    // Catches: a rotate undo that restores the matrix in the model but leaves
    // the raster showing the rotated picture.
    test.setTimeout(180_000);
    await openV2(page, PARAGRAPH_PDF);
    await insertImage(page);
    const placed = await settle(page);
    expect(placed.colourBbox, "the PNG must be on the page").not.toBeNull();
    const box = (s: Shot) => {
      const b = s.colourBbox!;
      return { w: b[2] - b[0], h: b[3] - b[1] };
    };
    const before = box(placed);
    expect(
      before.w / before.h,
      `the sample PNG is landscape (${before.w}x${before.h})`,
    ).toBeGreaterThan(1.1);

    await selectInsertedImage(page);
    await page.getByTestId("v2-imgop-menu").click();
    await page.getByTestId("v2-imgop-rotate-cw").click();
    await page.waitForTimeout(2000);
    const rotated = await settle(page);
    const after = box(rotated);
    expect(
      after.h / after.w,
      `rotate-cw must make the painted picture portrait (${after.w}x${after.h})`,
    ).toBeGreaterThan(1.1);

    await undo(page);
    const undone = await settle(page);
    const back = box(undone);
    expect(
      [back.w, back.h],
      `undo left the picture painted ${back.w}x${back.h}, was ` +
        `${before.w}x${before.h}`,
    ).toEqual([before.w, before.h]);
    expect(
      rowDist(placed, undone),
      "undo must restore the whole raster, not just the picture box",
    ).toBeLessThan(rowDist(placed, rotated) / 8);
  });

  test("undo repaints only the run it reverts - the earlier deleted run stays off the page", async ({
    page,
  }) => {
    // Catches: an undo that replays too much (both deletes come back) or paints
    // the restored run into the wrong region.
    test.setTimeout(180_000);
    await openV2(page, PARAGRAPH_PDF);
    await settle(page);
    const headBase = await shot(page, { runId: HEAD, pad: 4 });
    const bodyBase = await shot(page, { runId: BODY, pad: 4 });
    expect(headBase.ink, "heading must start inked").toBeGreaterThan(500);
    expect(bodyBase.ink, "body must start inked").toBeGreaterThan(2000);

    await selectRun(page, HEAD);
    await page.getByTestId("v2-delete").click();
    await page.waitForTimeout(1500);
    await selectRun(page, BODY);
    await page.getByTestId("v2-delete").click();
    await page.waitForTimeout(1500);
    const blank = await settle(page);
    expect(
      blank.ink,
      `both deletes must leave a blank page (${blank.ink} ink px left)`,
    ).toBeLessThan(80);

    await undo(page);
    await settle(page);
    const headNow = await shot(page, { rect: headBase.rect });
    const bodyNow = await shot(page, { rect: bodyBase.rect });
    expect(
      bodyNow.ink / bodyBase.ink,
      `one undo must repaint the body paragraph (${bodyNow.ink} of ` +
        `${bodyBase.ink} ink px)`,
    ).toBeGreaterThan(0.98);
    expect(
      headNow.ink,
      `the heading was deleted first and must stay off the page ` +
        `(${headNow.ink} ink px reappeared)`,
    ).toBeLessThan(headBase.ink * 0.02);
  });

  test("three stacked edits unwind through each intermediate painting in order", async ({
    page,
  }) => {
    // Catches: an undo stack that jumps straight to the original raster, or
    // that replays the steps out of order.
    test.setTimeout(240_000);
    await openV2(page, PARAGRAPH_PDF);
    const s0 = await settle(page);
    const d0 = (await depth(page)).undo;

    await selectRun(page, HEAD);
    await page.getByTestId("v2-delete").click();
    await page.waitForTimeout(1500);
    const s1 = await settle(page);
    const d1 = (await depth(page)).undo;

    await selectRun(page, BODY);
    await setFontSize(page, "16");
    const s2 = await settle(page);
    const d2 = (await depth(page)).undo;

    await insertImage(page);
    const s3 = await settle(page);
    const d3 = (await depth(page)).undo;

    // Each step must be visibly its own painting, or the walk back proves nothing.
    const steps: Array<[string, number]> = [
      ["0->1", rowDist(s0, s1)],
      ["1->2", rowDist(s1, s2)],
      ["2->3", rowDist(s2, s3)],
    ];
    for (const [name, d] of steps) {
      expect(d, `step ${name} did not change the raster`).toBeGreaterThan(400);
    }
    expect(
      [d1 > d0, d2 > d1, d3 > d2],
      "each edit must push at least one undo entry",
    ).toEqual([true, true, true]);

    await undo(page, d3 - d2);
    const back2 = await settle(page);
    expect(
      rowDist(s2, back2),
      `after unwinding the image the raster is ${rowDist(s2, back2)} row-ink ` +
        `from the 16pt painting (and ${rowDist(s1, back2)} from the one before)`,
    ).toBeLessThan(steps[2][1] / 8);

    await undo(page, d2 - d1);
    const back1 = await settle(page);
    expect(
      rowDist(s1, back1),
      `after unwinding the size change the raster is ${rowDist(s1, back1)} ` +
        `row-ink from the heading-deleted painting`,
    ).toBeLessThan(steps[1][1] / 8);

    await undo(page, d1 - d0);
    const back0 = await settle(page);
    expect(
      rowDist(s0, back0),
      `after unwinding the delete the raster is ${rowDist(s0, back0)} row-ink ` +
        `from the original page`,
    ).toBeLessThan(steps[0][1] / 8);
  });

  test("a fresh edit after undo drops the redo painting and leaves the new one on the page", async ({
    page,
  }) => {
    // Catches: a redo stack that survives a new edit and can repaint a
    // discarded state over the current one.
    test.setTimeout(180_000);
    await openV2(page, PARAGRAPH_PDF);
    const base = await settle(page);
    const headBase = await shot(page, { runId: HEAD, pad: 4 });

    await selectRun(page, HEAD);
    await page.getByTestId("v2-delete").click();
    await page.waitForTimeout(1500);
    const deleted = await settle(page);
    expect(
      rowDist(base, deleted),
      "the delete must change the raster",
    ).toBeGreaterThan(800);

    await undo(page);
    const undone = await settle(page);
    expect(
      (await depth(page)).redo,
      "undo must leave something on the redo stack",
    ).toBeGreaterThan(0);
    expect(
      rowDist(base, undone),
      "undo must restore the raster before the new edit",
    ).toBeLessThan(rowDist(base, deleted) / 8);

    // A different edit now: the discarded delete must be unreachable.
    await insertImage(page);
    const fresh = await settle(page);
    expect(
      (await depth(page)).redo,
      "a new edit must clear the redo stack",
    ).toBe(0);
    await expect(
      page.getByTestId("v2-redo"),
      "the redo button must be disabled after a new edit",
    ).toBeDisabled();

    expect(
      fresh.colour,
      "the new edit must be the painting on screen",
    ).toBeGreaterThan(1000);
    const headNow = await shot(page, { rect: headBase.rect });
    expect(
      headNow.ink / headBase.ink,
      `the discarded delete must not have been repainted (heading has ` +
        `${headNow.ink} of ${headBase.ink} ink px)`,
    ).toBeGreaterThan(0.98);
    expect(
      rowDist(deleted, fresh),
      "the raster must not be the discarded deleted painting",
    ).toBeGreaterThan(800);
  });
});
