import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

/**
 * Rotation, validated against the RENDERED BITMAP.
 *
 * Every test here samples the PDFium canvas and reasons about where the ink
 * actually landed - the overlay/model numbers are only ever used as the
 * prediction that the pixels have to confirm.
 *
 * Fixtures:
 *  - rotated-text-sample.pdf : one OBJECT-rotated run (Tm at 30deg).
 *  - rotated-pages.pdf       : 4 pages, /Rotate 0/90/270/180, each carrying the
 *                              same three strings in three distinct colours -
 *                              red "TOP EDGE", black "PAGE n", blue "source
 *                              /Rotate = N". The colours let a scan isolate one
 *                              run's glyphs from the page bitmap.
 *  - cropbox-rotate90.pdf    : CropBox offset + /Rotate 90, single "Hi".
 */

const FIX = (n: string): string =>
  path.join(import.meta.dirname, `../test-fixtures/${n}`);

const ROTATED30 = FIX("rotated-text-sample.pdf");
const ROTATED_PAGES = FIX("rotated-pages.pdf");
const CROP_ROT90 = FIX("cropbox-rotate90.pdf");

interface InkStat {
  n: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  /** Principal-axis angle in degrees, screen-y flipped: +ve = up-and-right. */
  deg: number;
}

interface PageScan {
  cw: number;
  ch: number;
  /** canvas px per PDF point for this page. */
  sx: number;
  dark: InkStat;
  red: InkStat;
  blue: InkStat;
}

async function openEditor(page: Page, file: string): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1200);
}

/**
 * Reads one page's canvas and returns per-colour ink statistics in CANVAS
 * pixels. Colour buckets follow the rotated-pages fixture's own ink colours;
 * single-colour fixtures land entirely in `dark`.
 */
async function scanPage(page: Page, pageIdx: number): Promise<PageScan | null> {
  return page.evaluate((idx: number) => {
    const pageEl = document.querySelector<HTMLElement>(
      `[data-testid="v2-page-${idx}"]`,
    );
    if (!pageEl) return null;
    const canvas = pageEl.querySelector("canvas");
    if (!canvas || !canvas.width || !canvas.height) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const dark: number[] = [];
    const red: number[] = [];
    const blue: number[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        if (r > 235 && g > 235 && b > 235) continue;
        if (r < 110 && g < 110 && b < 110) dark.push(x, y);
        else if (r > 150 && g < 120 && b < 120) red.push(x, y);
        else if (b > 150 && r < 120 && g < 120) blue.push(x, y);
      }
    }
    const stat = (flat: number[]) => {
      const n = flat.length / 2;
      if (n === 0)
        return {
          n: 0,
          minX: 0,
          minY: 0,
          maxX: 0,
          maxY: 0,
          cx: 0,
          cy: 0,
          deg: 0,
        };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < flat.length; i += 2) {
        const x = flat[i];
        const y = flat[i + 1];
        sx += x;
        sy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const cx = sx / n;
      const cy = sy / n;
      let vxx = 0;
      let vyy = 0;
      let vxy = 0;
      for (let i = 0; i < flat.length; i += 2) {
        const dx = flat[i] - cx;
        const dy = flat[i + 1] - cy;
        vxx += dx * dx;
        vyy += dy * dy;
        vxy += dx * dy;
      }
      // Principal axis of the glyph point cloud; negate for screen-y-down.
      let deg =
        (-0.5 * Math.atan2((2 * vxy) / n, (vxx - vyy) / n) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg <= -90) deg += 180;
      return {
        n,
        minX,
        minY,
        maxX,
        maxY,
        cx: +cx.toFixed(2),
        cy: +cy.toFixed(2),
        deg: +deg.toFixed(2),
      };
    };
    const store = (
      window as unknown as {
        __v2_editor_store: {
          doc: { loadedPages: () => Array<{ width: number }> };
        };
      }
    ).__v2_editor_store;
    const pdfWidth = store.doc.loadedPages()[idx]?.width ?? canvas.width;
    return {
      cw: canvas.width,
      ch: canvas.height,
      sx: canvas.width / pdfWidth,
      dark: stat(dark),
      red: stat(red),
      blue: stat(blue),
    };
  }, pageIdx);
}

interface RunAnchor {
  text: string;
  /** (matrix.e, matrix.f) pushed through the display transform, in canvas px. */
  px: number;
  py: number;
}

async function runAnchors(page: Page, pageIdx: number): Promise<RunAnchor[]> {
  return page.evaluate((idx: number) => {
    const store = (
      window as unknown as {
        __v2_editor_store: {
          doc: {
            loadedPages: () => Array<{
              width: number;
              height: number;
              display: {
                a: number;
                b: number;
                c: number;
                d: number;
                e: number;
                f: number;
              };
              runs: Array<{ text: string; matrix: { e: number; f: number } }>;
            }>;
          };
        };
      }
    ).__v2_editor_store;
    const pg = store.doc.loadedPages()[idx];
    if (!pg) return [];
    const canvas = document
      .querySelector<HTMLElement>(`[data-testid="v2-page-${idx}"]`)
      ?.querySelector("canvas");
    const sx = canvas ? canvas.width / pg.width : 1;
    const d = pg.display;
    return pg.runs.map((r) => ({
      text: r.text,
      px: (d.a * r.matrix.e + d.c * r.matrix.f + d.e) * sx,
      py: (pg.height - (d.b * r.matrix.e + d.d * r.matrix.f + d.f)) * sx,
    }));
  }, pageIdx);
}

/** Scrolls a page into view and waits until its canvas carries real ink. */
async function readyPage(page: Page, pageIdx: number): Promise<PageScan> {
  await page
    .locator(`[data-testid="v2-page-${pageIdx}"]`)
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  await expect
    .poll(
      async () => {
        const s = await scanPage(page, pageIdx);
        return s ? s.dark.n + s.red.n + s.blue.n : 0;
      },
      {
        timeout: 30_000,
        intervals: [500, 750, 1000, 1500],
        message: `page ${pageIdx} canvas never rendered any ink`,
      },
    )
    .toBeGreaterThan(200);
  const scan = await scanPage(page, pageIdx);
  expect(scan, `page ${pageIdx} scan`).not.toBeNull();
  return scan!;
}

/** Appends `text` to the end of a run and commits it with a blur. */
async function appendToRun(
  page: Page,
  runId: string,
  text: string,
): Promise<void> {
  await page.locator(`[data-testid="v2-run-${runId}"]`).click();
  await page.waitForTimeout(200);
  await page.evaluate(
    ([rid, txt]) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      if (!el) throw new Error(`run ${rid} not in the DOM`);
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, txt as string);
    },
    [runId, text] as const,
  );
  await page.waitForTimeout(250);
  await page.evaluate(
    (rid: string) =>
      document
        .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
        ?.blur(),
    runId,
  );
}

async function firstRunId(page: Page): Promise<string> {
  const id = await page.evaluate(
    () =>
      (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ id: string }> } };
          };
        }
      ).__v2_editor_store.doc.page(0).runs[0]?.id ?? "",
  );
  expect(id, "page 0 has a first run").toMatch(/^p0-/);
  return id;
}

// ---------------------------------------------------------------------------
// Object rotation (a rotated text matrix on an unrotated page)
// ---------------------------------------------------------------------------

test("rotated run: model bounds box the diagonal ink within 4px on every edge", async ({
  page,
}) => {
  // FAILS IF: bounds are built from horizontal glyph advances instead of the
  // rotated glyph extents - "Rotated" at 24pt advances ~108pt (162 canvas px)
  // horizontally, but its 30deg ink is only ~117px wide and ~82px tall.
  test.setTimeout(120_000);
  await openEditor(page, ROTATED30);
  const scan = await readyPage(page, 0);
  const ink = scan.dark;
  expect(ink.n, "the rotated run rendered dark glyph pixels").toBeGreaterThan(
    400,
  );

  const geo = await page.evaluate(() => {
    const store = (
      window as unknown as {
        __v2_editor_store: {
          doc: {
            page: (i: number) => {
              height: number;
              runs: Array<{
                bounds: { x: number; y: number; width: number; height: number };
              }>;
            };
          };
        };
      }
    ).__v2_editor_store;
    const pg = store.doc.page(0);
    return { bounds: pg.runs[0].bounds, pageHeight: pg.height };
  });

  const { sx } = scan;
  const boxLeft = geo.bounds.x * sx;
  const boxRight = (geo.bounds.x + geo.bounds.width) * sx;
  const boxTop = (geo.pageHeight - (geo.bounds.y + geo.bounds.height)) * sx;
  const boxBottom = (geo.pageHeight - geo.bounds.y) * sx;
  const inkBox = `ink=[${ink.minX},${ink.minY},${ink.maxX},${ink.maxY}]`;
  const modelBox = `bounds=[${boxLeft.toFixed(1)},${boxTop.toFixed(1)},${boxRight.toFixed(1)},${boxBottom.toFixed(1)}]`;

  expect(
    Math.abs(boxLeft - ink.minX),
    `left edge ${modelBox} vs ${inkBox}`,
  ).toBeLessThan(4);
  expect(
    Math.abs(boxRight - ink.maxX),
    `right edge ${modelBox} vs ${inkBox}`,
  ).toBeLessThan(4);
  expect(
    Math.abs(boxTop - ink.minY),
    `top edge ${modelBox} vs ${inkBox}`,
  ).toBeLessThan(4);
  expect(
    Math.abs(boxBottom - ink.maxY),
    `bottom edge ${modelBox} vs ${inkBox}`,
  ).toBeLessThan(4);
  // Teeth: an un-rotated advance box would be ~162px wide and ~36px tall.
  const inkH = ink.maxY - ink.minY;
  expect(
    inkH,
    `rotated ink must be tall, not a 1-line band (${inkBox})`,
  ).toBeGreaterThan(60);
});

test("rotated run: the ink's principal axis sits at ~30 degrees up-and-right", async ({
  page,
}) => {
  // FAILS IF: the 30deg text matrix is dropped when the page is rasterised -
  // upright text has a principal axis within a couple of degrees of 0.
  test.setTimeout(120_000);
  await openEditor(page, ROTATED30);
  const scan = await readyPage(page, 0);
  const ink = scan.dark;
  expect(ink.n, "glyph pixels found for the PCA").toBeGreaterThan(400);

  const source = await page.evaluate(() => {
    const m = (
      window as unknown as {
        __v2_editor_store: {
          doc: {
            page: (i: number) => {
              runs: Array<{ matrix: { a: number; b: number } }>;
            };
          };
        };
      }
    ).__v2_editor_store.doc.page(0).runs[0].matrix;
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  });
  expect(source, "fixture really is a 30deg text matrix").toBeCloseTo(30, 0);
  expect(
    ink.deg,
    `rendered ink axis ${ink.deg}deg must track the ${source.toFixed(1)}deg text matrix`,
  ).toBeGreaterThan(23);
  expect(
    ink.deg,
    `rendered ink axis ${ink.deg}deg is not near-horizontal`,
  ).toBeLessThan(37);
});

test("rotated run: the overlay box pins to the ink's baseline start corner", async ({
  page,
}) => {
  // FAILS IF: the overlay is placed from bounds.x (the rotated ink's left edge,
  // ~8px left of the baseline origin) instead of the transform-mapped baseline
  // anchor - or if the baseline maps to the wrong screen row.
  test.setTimeout(120_000);
  await openEditor(page, ROTATED30);
  const scan = await readyPage(page, 0);
  const ink = scan.dark;
  expect(ink.n, "glyph pixels found").toBeGreaterThan(400);

  const box = await page.evaluate(() => {
    const pageEl = document.querySelector<HTMLElement>(
      '[data-testid="v2-page-0"]',
    )!;
    const canvas = pageEl.querySelector("canvas")!;
    const cb = canvas.getBoundingClientRect();
    const k = canvas.width / cb.width;
    const el = pageEl.querySelector<HTMLElement>('[data-testid^="v2-run-"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const store = (
      window as unknown as {
        __v2_editor_store: {
          doc: {
            page: (i: number) => {
              height: number;
              runs: Array<{ matrix: { e: number; f: number } }>;
            };
          };
        };
      }
    ).__v2_editor_store;
    const pg = store.doc.page(0);
    const m = pg.runs[0].matrix;
    return {
      left: (r.left - cb.left) * k,
      top: (r.top - cb.top) * k,
      width: r.width * k,
      height: r.height * k,
      matrixE: m.e,
      matrixF: m.f,
      pageHeight: pg.height,
    };
  });
  expect(box, "the run overlay is in the DOM").not.toBeNull();
  const anchorX = box!.matrixE * scan.sx;
  const anchorY = (box!.pageHeight - box!.matrixF) * scan.sx;

  // The box is ROTATED with its glyphs now, so its bounding rect is the bounds
  // of a turned rectangle: its left edge swings PAST the baseline origin rather
  // than sitting on it. Asserting left === anchorX only held while the box was
  // axis-aligned over slanted text - the very defect this file was written
  // against. What must hold is that the baseline anchor lies within the box.
  expect(
    anchorX >= box!.left - 6 && anchorX <= box!.left + box!.width + 6,
    `baseline anchor ${anchorX.toFixed(1)} inside overlay span [${box!.left.toFixed(1)}, ${(box!.left + box!.width).toFixed(1)}]`,
  ).toBe(true);
  expect(
    anchorY >= box!.top - 6 && anchorY <= box!.top + box!.height + 6,
    `baseline row ${anchorY.toFixed(1)} inside overlay band [${box!.top.toFixed(1)}, ${(box!.top + box!.height).toFixed(1)}]`,
  ).toBe(true);
  // And the box must now actually cover the slanted ink rather than clipping
  // it: every inked column of the run falls inside the box's span.
  expect(
    ink.minX >= box!.left - 6,
    `ink starts at ${ink.minX} but the overlay starts at ${box!.left.toFixed(1)}`,
  ).toBe(true);
  expect(
    ink.maxX <= box!.left + box!.width + 6,
    `ink ends at ${ink.maxX} but the overlay ends at ${(box!.left + box!.width).toFixed(1)}`,
  ).toBe(true);
});

test("editing a rotated run re-renders the added glyphs along the same 30 degree axis", async ({
  page,
}) => {
  // FAILS IF: the re-emitted text is forced upright - the ink axis would drop
  // toward 0deg and the run would grow purely to the right instead of up-right.
  test.setTimeout(120_000);
  await openEditor(page, ROTATED30);
  const before = (await readyPage(page, 0)).dark;
  expect(before.n, "baseline ink present").toBeGreaterThan(400);

  await appendToRun(page, await firstRunId(page), "XY");
  await expect
    .poll(async () => (await scanPage(page, 0))?.dark.maxX ?? 0, {
      timeout: 25_000,
      intervals: [500, 750, 1000, 1500],
      message: "the edited run never re-rendered wider",
    })
    .toBeGreaterThan(before.maxX + 15);
  const after = (await scanPage(page, 0))!.dark;

  expect(
    Math.abs(after.deg - before.deg),
    `ink axis held: ${before.deg}deg -> ${after.deg}deg`,
  ).toBeLessThan(5);
  expect(
    after.deg,
    `still diagonal after the edit (${after.deg}deg)`,
  ).toBeGreaterThan(23);
  // Up-and-right growth: new glyphs extend right AND above the old ink.
  expect(
    after.minY,
    `appended glyphs climb above the old top (${before.minY} -> ${after.minY})`,
  ).toBeLessThan(before.minY - 10);
  // The run's start corner is untouched - only the tail moved.
  expect(
    Math.abs(after.minX - before.minX),
    `start corner x held (${before.minX} -> ${after.minX})`,
  ).toBeLessThan(4);
  expect(
    Math.abs(after.maxY - before.maxY),
    `start corner y held (${before.maxY} -> ${after.maxY})`,
  ).toBeLessThan(4);
});

// ---------------------------------------------------------------------------
// Page /Rotate
// ---------------------------------------------------------------------------

const PAGE_ROTATIONS = [
  { idx: 0, rotate: 0, edge: "top" },
  { idx: 1, rotate: 1, edge: "right" },
  { idx: 2, rotate: 3, edge: "left" },
  { idx: 3, rotate: 2, edge: "bottom" },
] as const;

test("each page /Rotate lays the red TOP EDGE band along the display edge it names", async ({
  page,
}) => {
  // FAILS IF: /Rotate is ignored when rasterising, or 90 and 270 are swapped -
  // the red band would stay horizontal along the top on all four pages.
  test.setTimeout(180_000);
  await openEditor(page, ROTATED_PAGES);
  const seen: string[] = [];
  for (const { idx, rotate, edge } of PAGE_ROTATIONS) {
    const scan = await readyPage(page, idx);
    const red = scan.red;
    expect(red.n, `page ${idx}: red TOP EDGE glyphs rendered`).toBeGreaterThan(
      500,
    );
    const w = red.maxX - red.minX;
    const h = red.maxY - red.minY;
    seen.push(
      `p${idx}(rot${rotate}) red=[${red.minX},${red.minY},${red.maxX},${red.maxY}]`,
    );
    const declared = await page.evaluate(
      (i: number) =>
        (
          window as unknown as {
            __v2_editor_store: {
              doc: {
                loadedPages: () => Array<{ display: { rotate: number } }>;
              };
            };
          }
        ).__v2_editor_store.doc.loadedPages()[i].display.rotate,
      idx,
    );
    expect(declared, `page ${idx} declares ${rotate} quarter turns`).toBe(
      rotate,
    );

    if (edge === "top" || edge === "bottom") {
      expect(
        w / h,
        `page ${idx}: band is horizontal (${w}x${h})`,
      ).toBeGreaterThan(4);
    } else {
      expect(
        h / w,
        `page ${idx}: band is vertical (${w}x${h})`,
      ).toBeGreaterThan(4);
    }
    if (edge === "top")
      expect(
        red.maxY,
        `page ${idx}: band hugs the top of ${scan.ch}px`,
      ).toBeLessThan(scan.ch * 0.12);
    if (edge === "bottom")
      expect(
        red.minY,
        `page ${idx}: band hugs the bottom of ${scan.ch}px`,
      ).toBeGreaterThan(scan.ch * 0.85);
    if (edge === "right")
      expect(
        red.minX,
        `page ${idx}: band hugs the right of ${scan.cw}px`,
      ).toBeGreaterThan(scan.cw * 0.85);
    if (edge === "left")
      expect(
        red.maxX,
        `page ${idx}: band hugs the left of ${scan.cw}px`,
      ).toBeLessThan(scan.cw * 0.12);
  }
  expect(seen.length, `scanned every rotation: ${seen.join(" ")}`).toBe(4);
});

test("the display transform's baseline anchor lands on its own glyphs at every /Rotate", async ({
  page,
}) => {
  // FAILS IF: the CropBox/rotation transform's translation is wrong for a
  // quarter-turn - the overlay anchor would sit hundreds of px from the ink it
  // is supposed to be attached to (the bug that put runs off-page).
  test.setTimeout(180_000);
  await openEditor(page, ROTATED_PAGES);
  let checked = 0;
  for (const { idx, rotate } of PAGE_ROTATIONS) {
    const scan = await readyPage(page, idx);
    const anchors = await runAnchors(page, idx);
    expect(anchors.length, `page ${idx} has three runs`).toBe(3);
    for (const a of anchors) {
      const ink = /TOP EDGE/.test(a.text)
        ? scan.red
        : /source/.test(a.text)
          ? scan.blue
          : scan.dark;
      expect(ink.n, `page ${idx}: ink for "${a.text}"`).toBeGreaterThan(500);
      const corners: Array<[number, number]> = [
        [ink.minX, ink.minY],
        [ink.maxX, ink.minY],
        [ink.minX, ink.maxY],
        [ink.maxX, ink.maxY],
      ];
      const best = Math.min(
        ...corners.map(([x, y]) =>
          Math.max(Math.abs(x - a.px), Math.abs(y - a.py)),
        ),
      );
      expect(
        best,
        `rot${rotate} "${a.text}": anchor (${a.px.toFixed(1)},${a.py.toFixed(1)}) vs ink box [${ink.minX},${ink.minY},${ink.maxX},${ink.maxY}]`,
      ).toBeLessThan(9);
      checked += 1;
    }
  }
  expect(checked, "12 anchor/ink pairs checked").toBe(12);
});

test("/Rotate 90 and /Rotate 270 render one source page as exact 180 degree mirrors", async ({
  page,
}) => {
  // FAILS IF: 270 is treated as 90 (identical boxes) or either quarter-turn
  // renders in the wrong direction. Uses the red run, whose string is
  // byte-identical on both pages, so the two ink boxes must be congruent.
  test.setTimeout(180_000);
  await openEditor(page, ROTATED_PAGES);
  const p1 = await readyPage(page, 1);
  const p2 = await readyPage(page, 2);
  expect(p1.red.n, "page 1 red ink").toBeGreaterThan(500);
  expect(p2.red.n, "page 2 red ink").toBeGreaterThan(500);
  expect([p1.cw, p1.ch], "both landscape after the quarter turn").toEqual([
    p2.cw,
    p2.ch,
  ]);

  const mirrored = {
    minX: p1.cw - p2.red.maxX,
    maxX: p1.cw - p2.red.minX,
    minY: p1.ch - p2.red.maxY,
    maxY: p1.ch - p2.red.minY,
  };
  const shown = `rot90=[${p1.red.minX},${p1.red.minY},${p1.red.maxX},${p1.red.maxY}] mirrored270=[${mirrored.minX},${mirrored.minY},${mirrored.maxX},${mirrored.maxY}]`;
  expect(Math.abs(mirrored.minX - p1.red.minX), `minX ${shown}`).toBeLessThan(
    3,
  );
  expect(Math.abs(mirrored.maxX - p1.red.maxX), `maxX ${shown}`).toBeLessThan(
    3,
  );
  expect(Math.abs(mirrored.minY - p1.red.minY), `minY ${shown}`).toBeLessThan(
    3,
  );
  expect(Math.abs(mirrored.maxY - p1.red.maxY), `maxY ${shown}`).toBeLessThan(
    3,
  );
  // Teeth: the two boxes must NOT already coincide, or the mirror is vacuous.
  expect(
    Math.abs(p1.red.minX - p2.red.minX),
    `the two pages really do render in different places (${shown})`,
  ).toBeGreaterThan(200);
});

test("cropbox-rotate90: the glyphs rasterise in the rotated corner, not the crop-only spot", async ({
  page,
}) => {
  // FAILS IF: the display transform applies the CropBox offset but drops the
  // /Rotate - "Hi" would render near the top-LEFT (x~15) instead of the
  // top-RIGHT (x~480) of the 525px-wide canvas.
  test.setTimeout(120_000);
  await openEditor(page, CROP_ROT90);
  const scan = await readyPage(page, 0);
  const ink = scan.dark;
  expect(ink.n, '"Hi" glyph pixels rendered').toBeGreaterThan(100);

  const anchors = await runAnchors(page, 0);
  expect(anchors.length, "one run on the page").toBe(1);
  const a = anchors[0];
  const inkBox = `[${ink.minX},${ink.minY},${ink.maxX},${ink.maxY}] on ${scan.cw}x${scan.ch}`;

  // The transform-mapped anchor is the ink's top-left corner on a 90deg page.
  expect(
    Math.abs(a.px - ink.minX),
    `anchor x ${a.px.toFixed(1)} vs ${inkBox}`,
  ).toBeLessThan(6);
  expect(
    Math.abs(a.py - ink.minY),
    `anchor y ${a.py.toFixed(1)} vs ${inkBox}`,
  ).toBeLessThan(6);
  // Rotated placement: right-hand third of the page, top-hand third.
  expect(
    ink.minX,
    `ink is on the rotated (right) side: ${inkBox}`,
  ).toBeGreaterThan(scan.cw * 0.66);
  expect(ink.maxY, `ink is near the top: ${inkBox}`).toBeLessThan(
    scan.ch * 0.34,
  );
  // Crop-only (rotation dropped) would land at raw(60,350) - crop(50,30) =
  // display (10,320) => canvas x~15. Prove we are nowhere near it.
  const cropOnlyX = (60 - 50) * scan.sx;
  expect(
    ink.minX - cropOnlyX,
    `far from the crop-only x=${cropOnlyX.toFixed(1)} (${inkBox})`,
  ).toBeGreaterThan(300);
});

test("appending to a run on a /Rotate 90 page grows the ink downward at a fixed width", async ({
  page,
}) => {
  // FAILS IF: the edit re-emits text without the page rotation - the new
  // glyphs would extend to the RIGHT and the ink box would widen instead of
  // lengthening downward.
  test.setTimeout(120_000);
  await openEditor(page, CROP_ROT90);
  const before = (await readyPage(page, 0)).dark;
  expect(before.n, "baseline ink present").toBeGreaterThan(100);
  const beforeW = before.maxX - before.minX;

  await appendToRun(page, await firstRunId(page), "MMM");
  await expect
    .poll(async () => (await scanPage(page, 0))?.dark.maxY ?? 0, {
      timeout: 25_000,
      intervals: [500, 750, 1000, 1500],
      message: "the edited run never re-rendered longer",
    })
    .toBeGreaterThan(before.maxY + 40);
  const after = (await scanPage(page, 0))!.dark;
  const afterW = after.maxX - after.minX;
  const shown = `before=[${before.minX},${before.minY},${before.maxX},${before.maxY}] after=[${after.minX},${after.minY},${after.maxX},${after.maxY}]`;

  expect(afterW - beforeW, `column width unchanged: ${shown}`).toBeLessThan(4);
  expect(
    Math.abs(after.minX - before.minX),
    `left column edge held: ${shown}`,
  ).toBeLessThan(3);
  expect(
    Math.abs(after.minY - before.minY),
    `text still starts at the same row: ${shown}`,
  ).toBeLessThan(4);
  expect(
    after.maxY - before.maxY,
    `the appended glyphs run down the page: ${shown}`,
  ).toBeGreaterThan(40);
});

test("text inserted on a /Rotate 90 page rasterises as an upright horizontal band", async ({
  page,
}) => {
  // FAILS IF: the counter-rotation for new text is missing - the inserted
  // glyphs would rasterise as a tall narrow column like the page's own text
  // instead of a wide short band that reads upright on the rotated page.
  test.setTimeout(120_000);
  await openEditor(page, CROP_ROT90);
  const before = (await readyPage(page, 0)).dark;
  expect(before.n, "the page's own rotated ink is present").toBeGreaterThan(
    100,
  );

  await page.getByTestId("v2-add-text").click();
  await page.getByTestId("v2-page-0").click({ position: { x: 180, y: 200 } });

  // Isolate the inserted run: everything below the pre-existing "Hi" ink.
  const cutoff = before.maxY + 40;
  const regionInk = async () =>
    page.evaluate((y0: number) => {
      const canvas = document
        .querySelector<HTMLElement>('[data-testid="v2-page-0"]')
        ?.querySelector("canvas");
      if (!canvas || !canvas.width) return null;
      const ctx = canvas.getContext("2d")!;
      const { data, width, height } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let n = 0;
      for (let y = y0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const o = (y * width + x) * 4;
          if (data[o] < 160 && data[o + 1] < 160) {
            n += 1;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { n, minX, minY, maxX, maxY };
    }, cutoff);

  await expect
    .poll(async () => (await regionInk())?.n ?? 0, {
      timeout: 25_000,
      intervals: [500, 750, 1000, 1500],
      message: "the inserted run never rasterised onto the page bitmap",
    })
    .toBeGreaterThan(80);
  const ins = (await regionInk())!;
  const w = ins.maxX - ins.minX;
  const h = ins.maxY - ins.minY;
  const shown = `inserted ink=[${ins.minX},${ins.minY},${ins.maxX},${ins.maxY}] (${w}x${h}, n=${ins.n})`;

  expect(
    w / h,
    `inserted text reads upright, i.e. wide and short: ${shown}`,
  ).toBeGreaterThan(2.5);
  // ...and it reads the other way round from the page's own rotated text,
  // rasterised into the very same bitmap.
  const pageAspect = (before.maxX - before.minX) / (before.maxY - before.minY);
  expect(
    w / h / pageAspect,
    `inserted band is far wider-per-height than the page's own /Rotate 90 text (${(w / h).toFixed(2)} vs ${pageAspect.toFixed(2)}): ${shown}`,
  ).toBeGreaterThan(2.5);
});
