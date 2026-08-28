import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Visual zoom / render-scale suite.
//
// Every test here asserts on PIXELS sampled out of the page <canvas> (the
// PDFium bitmap), not just on store numbers. The invariant under test is that
// the bitmap and the contentEditable run overlays stay registered with each
// other at every render scale: the overlay boxes must track the ink, the
// bitmap must be re-rendered (not CSS-upscaled) when the scale changes, and
// returning to a scale must reproduce the same picture.
//
// Geometry facts this suite relies on (verified against the source):
//   * `PdfiumPageRenderer.rasterSize` => canvas.width = round(pageWidth*scale)
//   * the canvas CSS size equals its backing size, so 1 CSS px = 1 canvas px
//   * `.v2-run` is absolutely positioned at the text origin, then given
//     `padding: 2px` and `translate: -2px -2px`. Its border box therefore
//     starts exactly 2 CSS px before the text origin, at EVERY scale - the
//     offset is a constant, it is not scaled.

const PARA_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
const JUSTIFIED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/justified-sample.pdf",
);

/** Fixed CSS-pixel gap between a `.v2-run` border box and its text origin. */
const RUN_BOX_INSET = 2;

/**
 * The overlay origin must sit on the run's first glyph pixel. The only legal
 * discrepancy is the glyph's own left side bearing plus bitmap rounding, and
 * the side bearing is a font measurement, so the window scales with the zoom.
 * A mis-scaled overlay is out by far more than this at any zoom.
 */
function expectRegistered(
  inkLeft: number,
  origin: number,
  scale: number,
  where: string,
): void {
  const gap = inkLeft - origin;
  const detail = `${where}: overlay origin x=${origin.toFixed(2)}, first glyph pixel x=${inkLeft}, gap ${gap.toFixed(2)}px at ${scale}x`;
  expect(gap, `${detail} - the ink starts LEFT of the overlay`).toBeGreaterThan(
    -(1.5 + scale),
  );
  expect(
    gap,
    `${detail} - the overlay starts too far left of the ink`,
  ).toBeLessThanOrEqual(1.5 + 1.6 * scale);
}

interface InkBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Pixels darker than the ink threshold. */
  count: number;
  /** Anti-aliasing ramp pixels: not white, not fully dark. */
  mid: number;
  /** Order-sensitive checksum over every red channel byte in the bitmap. */
  sig: number;
}

interface RunRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Snap {
  scale: number;
  pageW: number;
  pageH: number;
  canvasW: number;
  canvasH: number;
  cssW: number;
  cssH: number;
  ink: InkBox;
  runs: RunRect[];
}

interface EditorState {
  renderScale: number;
  pages: Array<{ width: number; height: number }>;
}

interface StoreWindow extends Window {
  __v2_editor_store?: {
    getState: () => EditorState;
    setRenderScale: (scale: number) => void;
  };
}

async function openEditor(
  page: import("@playwright/test").Page,
  file: string,
): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

/**
 * Sample page 0: canvas geometry, whole-bitmap ink statistics and the run
 * overlay rects, all in canvas pixels relative to the canvas top-left.
 * Self-contained - it is serialised into the browser.
 */
function snapshotFn(): Snap {
  const store = (window as StoreWindow).__v2_editor_store;
  const pageEl = document.querySelector<HTMLElement>(
    '[data-testid="v2-page-0"]',
  );
  if (!store || !pageEl) throw new Error("editor page 0 is not mounted");
  const canvas = pageEl.querySelector("canvas");
  if (!canvas) throw new Error("page 0 has no canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const cb = canvas.getBoundingClientRect();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let mid = 0;
  let sig = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      sig = (sig * 31 + r) >>> 0;
      if (r < 160 && g < 160) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else if (r < 245 && g < 245) {
        mid++;
      }
    }
  }

  const runs = Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid^="v2-run-p0-"]'),
  ).map((el) => {
    const rb = el.getBoundingClientRect();
    return {
      id: el.getAttribute("data-testid") ?? "",
      left: rb.left - cb.left,
      top: rb.top - cb.top,
      width: rb.width,
      height: rb.height,
    };
  });

  const pageState = store.getState().pages[0];

  return {
    scale: store.getState().renderScale,
    pageW: pageState.width,
    pageH: pageState.height,
    canvasW: canvas.width,
    canvasH: canvas.height,
    cssW: cb.width,
    cssH: cb.height,
    ink: { minX, minY, maxX, maxY, count, mid, sig },
    runs,
  };
}

/**
 * Ink statistics for one run's horizontal band of the bitmap. The band spans
 * the FULL canvas width on purpose: the overlay box must not be allowed to
 * define the search window, or "the ink is inside the box" would be true by
 * construction.
 */
function runInkFn(runId: string): InkBox {
  const pageEl = document.querySelector<HTMLElement>(
    '[data-testid="v2-page-0"]',
  );
  const runEl = document.querySelector<HTMLElement>(`[data-testid="${runId}"]`);
  if (!pageEl || !runEl) throw new Error(`run ${runId} not mounted`);
  const canvas = pageEl.querySelector("canvas");
  if (!canvas) throw new Error("page 0 has no canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const cb = canvas.getBoundingClientRect();
  const rb = runEl.getBoundingClientRect();

  const x0 = 0;
  const y0 = Math.max(0, Math.floor(rb.top - cb.top) - 2);
  const x1 = canvas.width;
  const y1 = Math.min(canvas.height, Math.ceil(rb.bottom - cb.top) + 2);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const data = ctx.getImageData(x0, y0, w, h).data;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let mid = 0;
  let sig = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      sig = (sig * 31 + r) >>> 0;
      if (r < 160 && g < 160) {
        count++;
        if (x0 + x < minX) minX = x0 + x;
        if (x0 + x > maxX) maxX = x0 + x;
        if (y0 + y < minY) minY = y0 + y;
        if (y0 + y > maxY) maxY = y0 + y;
      } else if (r < 245 && g < 245) {
        mid++;
      }
    }
  }
  return { minX, minY, maxX, maxY, count, mid, sig };
}

/** Wait until page 0's bitmap has been re-rendered at `scale`. */
async function waitForBitmap(
  page: import("@playwright/test").Page,
  scale: number,
): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="v2-page-0"]',
      );
      const canvas = el?.querySelector("canvas");
      const store = (window as StoreWindow).__v2_editor_store;
      if (!canvas || !store) return false;
      const st = store.getState();
      if (Math.abs(st.renderScale - want) > 1e-6) return false;
      return canvas.width === Math.max(1, Math.round(st.pages[0].width * want));
    },
    scale,
    { timeout: 20_000 },
  );
  // The overlay rects settle a frame after the bitmap swap.
  await page.waitForTimeout(400);
}

async function zoomTo(
  page: import("@playwright/test").Page,
  scale: number,
): Promise<Snap> {
  await page.evaluate((v) => {
    (window as StoreWindow).__v2_editor_store?.setRenderScale(v);
  }, scale);
  await waitForBitmap(page, scale);
  return page.evaluate(snapshotFn);
}

/** Ink bounding box expressed as fractions of the canvas, scale-independent. */
function normalisedInk(s: Snap): {
  l: number;
  t: number;
  r: number;
  b: number;
} {
  return {
    l: s.ink.minX / s.canvasW,
    t: s.ink.minY / s.canvasH,
    r: s.ink.maxX / s.canvasW,
    b: s.ink.maxY / s.canvasH,
  };
}

function requireRun(s: Snap, index: number): RunRect {
  expect(
    s.runs.length,
    `expected at least ${index + 1} run overlays on page 0, got ${s.runs.length}`,
  ).toBeGreaterThan(index);
  return s.runs[index];
}

function requireInk(ink: InkBox, where: string): void {
  expect(
    ink.count,
    `${where}: no dark pixels found - the assertion would be vacuous`,
  ).toBeGreaterThan(20);
}

test.describe("PDF text editor v2 - zoom keeps bitmap and overlay registered", () => {
  // Breakage caught: a render scale that reaches the bitmap but not the page
  // layout (or vice versa) would move the ink to a different fraction of the
  // canvas at some zoom level.
  test("page ink occupies the same fraction of the bitmap at 100%, 200% and 300%", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);

    const snaps: Snap[] = [];
    for (const scale of [1, 2, 3]) snaps.push(await zoomTo(page, scale));

    for (const s of snaps) requireInk(s.ink, `scale ${s.scale}`);

    const base = normalisedInk(snaps[0]);
    for (const s of snaps.slice(1)) {
      const n = normalisedInk(s);
      for (const edge of ["l", "t", "r", "b"] as const) {
        expect(
          Math.abs(n[edge] - base[edge]),
          `ink ${edge} edge at ${s.scale}x sits at ${n[edge].toFixed(4)} of the canvas but at ${base[edge].toFixed(4)} at 1x`,
        ).toBeLessThan(0.005);
      }
    }
    // And the absolute ink box really did grow with the zoom, so the
    // normalised comparison above is not comparing three identical bitmaps.
    expect(
      snaps[2].ink.maxX / snaps[0].ink.maxX,
      `ink right edge should be ~3x wider at 300%: ${snaps[2].ink.maxX} vs ${snaps[0].ink.maxX}`,
    ).toBeGreaterThan(2.9);
  });

  // Breakage caught: a devicePixelRatio double-scale, or a canvas whose
  // backing store stops tracking round(pageWidth * scale).
  test("canvas backing store equals round(page size x zoom) and the ink grows with it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);

    const one = await zoomTo(page, 1);
    const four = await zoomTo(page, 4);
    requireInk(one.ink, "scale 1");
    requireInk(four.ink, "scale 4");

    for (const s of [one, four]) {
      expect(
        s.canvasW,
        `canvas backing width at ${s.scale}x should be round(${s.pageW} * ${s.scale})`,
      ).toBe(Math.round(s.pageW * s.scale));
      expect(
        s.canvasH,
        `canvas backing height at ${s.scale}x should be round(${s.pageH} * ${s.scale})`,
      ).toBe(Math.round(s.pageH * s.scale));
      // CSS size == backing size: the bitmap is never stretched by the browser.
      expect(
        Math.abs(s.cssW - s.canvasW),
        `canvas CSS width ${s.cssW} must equal its backing width ${s.canvasW} at ${s.scale}x`,
      ).toBeLessThanOrEqual(1);
    }

    // A 4x bitmap holds far more ink than a 1x one. Linear growth (4x) would
    // mean the glyphs were not re-rasterised at all.
    expect(
      four.ink.count / one.ink.count,
      `dark-pixel count should grow super-linearly from 1x (${one.ink.count}) to 4x (${four.ink.count})`,
    ).toBeGreaterThan(8);
  });

  // Breakage caught: the overlay computing its left from an unscaled (or
  // differently scaled) page coordinate - the box would drift off the glyphs
  // as soon as the zoom left 100%.
  test("overlay-to-ink offset ratio tracks the zoom across five render scales", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);

    const scales = [0.5, 1, 1.75, 2.5, 4];
    const rows: Array<{
      scale: number;
      origin: number;
      inkLeft: number;
      inkRight: number;
      boxRight: number;
    }> = [];

    for (const scale of scales) {
      const snap = await zoomTo(page, scale);
      const run = requireRun(snap, 0);
      const ink = await page.evaluate(runInkFn, run.id);
      requireInk(ink, `run ${run.id} at ${scale}x`);
      rows.push({
        scale,
        // Border box left + 4 CSS px = the text origin the overlay was placed at.
        origin: run.left + RUN_BOX_INSET,
        inkLeft: ink.minX,
        inkRight: ink.maxX,
        boxRight: run.left + run.width,
      });
    }

    for (const r of rows) {
      expectRegistered(r.inkLeft, r.origin, r.scale, "heading run");
      // The ink stays inside the box: the search band was the full canvas
      // width, so this can genuinely fail.
      expect(
        r.inkRight,
        `at ${r.scale}x the run ink ends at x=${r.inkRight}, past the overlay right edge ${r.boxRight.toFixed(2)}`,
      ).toBeLessThanOrEqual(r.boxRight + 2);
    }

    // The core registration invariant: box position and ink position grow by
    // the SAME factor as the render scale.
    const base = rows[scales.indexOf(1)];
    for (const r of rows) {
      if (r.scale === 1) continue;
      expect(
        r.origin / base.origin,
        `overlay origin ratio at ${r.scale}x is ${(r.origin / base.origin).toFixed(3)}, expected ~${r.scale}`,
      ).toBeCloseTo(r.scale, 1);
      expect(
        r.inkLeft / base.inkLeft,
        `ink left-edge ratio at ${r.scale}x is ${(r.inkLeft / base.inkLeft).toFixed(3)}, expected ~${r.scale}`,
      ).toBeCloseTo(r.scale, 1);
      expect(
        Math.abs(r.origin / base.origin - r.inkLeft / base.inkLeft),
        `at ${r.scale}x the overlay grew by ${(r.origin / base.origin).toFixed(3)} but the ink by ${(r.inkLeft / base.inkLeft).toFixed(3)}`,
      ).toBeLessThan(0.06);
    }
  });

  // Breakage caught: a re-render that does not reproduce the original bitmap
  // (stale tile, half-cleared canvas, accumulated transform).
  test("zooming 100% -> 400% -> 100% reproduces a pixel-identical bitmap", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);

    const before = await zoomTo(page, 1);
    requireInk(before.ink, "scale 1 before");

    const zoomed = await zoomTo(page, 4);
    expect(
      zoomed.ink.sig,
      "the 400% bitmap must differ from the 100% one, otherwise the round trip proves nothing",
    ).not.toBe(before.ink.sig);

    const after = await zoomTo(page, 1);
    expect(
      after.canvasW,
      `canvas width after the round trip: ${after.canvasW} vs ${before.canvasW}`,
    ).toBe(before.canvasW);
    expect(
      after.ink.sig >>> 0,
      `whole-bitmap checksum changed after zooming out and back: ${after.ink.sig} vs ${before.ink.sig}`,
    ).toBe(before.ink.sig >>> 0);
    expect(
      after.ink.count,
      `dark-pixel count after the round trip: ${after.ink.count} vs ${before.ink.count}`,
    ).toBe(before.ink.count);
    expect([
      after.ink.minX,
      after.ink.minY,
      after.ink.maxX,
      after.ink.maxY,
    ]).toEqual([
      before.ink.minX,
      before.ink.minY,
      before.ink.maxX,
      before.ink.maxY,
    ]);
  });

  // Breakage caught: zooming by CSS-stretching the 1x bitmap instead of
  // re-rasterising. A stretched bitmap keeps (or worsens) its anti-aliasing
  // ramp; a re-rendered one gets proportionally crisper.
  test("text is re-rasterised, not upscaled: the anti-alias ramp shrinks as zoom rises", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);

    const ratios: Array<{ scale: number; ramp: number }> = [];
    for (const scale of [1, 2, 4]) {
      const s = await zoomTo(page, scale);
      requireInk(s.ink, `scale ${scale}`);
      ratios.push({ scale, ramp: s.ink.mid / s.ink.count });
    }

    for (let i = 1; i < ratios.length; i++) {
      expect(
        ratios[i].ramp,
        `anti-alias ramp per ink pixel must fall as zoom rises: ${ratios[i].scale}x = ${ratios[i].ramp.toFixed(3)} vs ${ratios[i - 1].scale}x = ${ratios[i - 1].ramp.toFixed(3)}`,
      ).toBeLessThan(ratios[i - 1].ramp);
    }
    // A CSS upscale would keep the ratio roughly flat; demand a real drop.
    expect(
      ratios[2].ramp,
      `4x ramp ratio ${ratios[2].ramp.toFixed(3)} should be far below the 1x ratio ${ratios[0].ramp.toFixed(3)}`,
    ).toBeLessThan(ratios[0].ramp * 0.6);
  });

  // Breakage caught: a run whose font size (and therefore drawn glyph height)
  // stops tracking the render scale, e.g. a px font size that is scaled once
  // and then cached.
  test("a single-line run's glyph height scales linearly with the zoom", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);

    const measure = async (scale: number) => {
      const snap = await zoomTo(page, scale);
      const run = requireRun(snap, 0);
      const ink = await page.evaluate(runInkFn, run.id);
      requireInk(ink, `heading run at ${scale}x`);
      return { height: ink.maxY - ink.minY + 1, boxHeight: run.height };
    };

    const a = await measure(1);
    const b = await measure(3);

    expect(
      b.height / a.height,
      `heading glyph height should triple from 1x (${a.height}px) to 3x (${b.height}px)`,
    ).toBeGreaterThan(2.8);
    expect(
      b.height / a.height,
      `heading glyph height should not more than triple from 1x (${a.height}px) to 3x (${b.height}px)`,
    ).toBeLessThan(3.2);
    // The overlay box grew by the same factor, so the caret matches the glyphs.
    expect(
      b.boxHeight / a.boxHeight,
      `overlay box height ratio ${(b.boxHeight / a.boxHeight).toFixed(3)} should match the glyph ratio ${(b.height / a.height).toFixed(3)}`,
    ).toBeGreaterThan(2.8);
  });

  // Breakage caught: the Ctrl+wheel path updating renderScale without the
  // overlays following - the store number would move but the ink and the box
  // would part company.
  test("Ctrl+wheel zoom moves the bitmap and the overlay together", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);

    const before = await zoomTo(page, 1);
    const beforeRun = requireRun(before, 0);
    const beforeInk = await page.evaluate(runInkFn, beforeRun.id);
    requireInk(beforeInk, "run before wheel zoom");

    // 10 Ctrl+wheel-up events = +0.1 each = 100% -> 200%.
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        document.querySelector('[data-testid="v2-stage"]')?.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -100,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    }
    await waitForBitmap(page, 2);

    const after = await page.evaluate(snapshotFn);
    expect(
      after.scale,
      `10 Ctrl+wheel-up steps of 0.1 from 100% should land on 200%, got ${after.scale}`,
    ).toBeCloseTo(2, 5);
    const afterRun = requireRun(after, 0);
    const afterInk = await page.evaluate(runInkFn, afterRun.id);
    requireInk(afterInk, "run after wheel zoom");

    // The ink actually moved (this is not a no-op comparison)...
    expect(
      afterInk.minX / beforeInk.minX,
      `wheel zoom should double the ink offset: ${afterInk.minX} vs ${beforeInk.minX}`,
    ).toBeGreaterThan(1.8);
    // ...and the overlay moved with it.
    expectRegistered(
      afterInk.minX,
      afterRun.left + RUN_BOX_INSET,
      after.scale,
      "after Ctrl+wheel zoom",
    );
    expect(
      Math.abs(afterInk.minY - beforeInk.minY * 2),
      `the run's top glyph row should double from ${beforeInk.minY} to ~${beforeInk.minY * 2}, got ${afterInk.minY}`,
    ).toBeLessThanOrEqual(3);
  });

  // Breakage caught: Fit computing a scale from the wrong width, or applying
  // it to the layout but not to the bitmap.
  test("Fit to width sizes the bitmap to the stage and keeps the ink registered", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);
    await zoomTo(page, 1);

    await page.getByTestId("v2-zoom-fit").click();
    await page.waitForTimeout(1800);
    const snap = await page.evaluate(snapshotFn);
    requireInk(snap.ink, "fit-to-width");

    const stageWidth = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="v2-stage"]',
      );
      if (!el) throw new Error("no stage");
      return el.clientWidth;
    });

    // EditorTopBar fits to (stage width - 64px of padding).
    expect(
      snap.canvasW,
      `fit bitmap width ${snap.canvasW} should fill the stage width ${stageWidth} minus 64px of padding`,
    ).toBe(
      Math.round(snap.pageW * +((stageWidth - 64) / snap.pageW).toFixed(2)),
    );
    expect(
      stageWidth - snap.canvasW,
      `fit should leave ~64px of slack, left ${stageWidth - snap.canvasW}px`,
    ).toBeLessThanOrEqual(70);
    expect(
      snap.canvasW,
      `fit must actually enlarge the page beyond its 100% width ${snap.pageW}`,
    ).toBeGreaterThan(snap.pageW);

    const run = requireRun(snap, 0);
    const ink = await page.evaluate(runInkFn, run.id);
    requireInk(ink, "fit-to-width run");
    expectRegistered(
      ink.minX,
      run.left + RUN_BOX_INSET,
      snap.scale,
      "after Fit to width",
    );
  });

  // Breakage caught: the 25% floor letting the scale go lower (or the bitmap
  // collapsing to a blank thumbnail with no ink left).
  test("zoom-out clamps at 25% and the shrunken bitmap still carries the same layout", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARA_PDF);
    const base = await zoomTo(page, 1);
    requireInk(base.ink, "scale 1 baseline");

    for (let i = 0; i < 12; i++) {
      await page.getByTestId("v2-zoom-out").click();
    }
    await waitForBitmap(page, 0.25);
    await expect(page.getByTestId("v2-zoom-percent")).toHaveText("25%");

    const floor = await page.evaluate(snapshotFn);
    expect(
      floor.canvasW,
      `at the 25% floor the bitmap should be round(${floor.pageW} * 0.25) px wide`,
    ).toBe(Math.round(floor.pageW * 0.25));
    requireInk(floor.ink, "25% floor");

    // The page is 1/16th of the area but the layout is unchanged: the ink box
    // still covers the same fraction of the canvas.
    const b = normalisedInk(base);
    const f = normalisedInk(floor);
    for (const edge of ["l", "t", "r", "b"] as const) {
      expect(
        Math.abs(f[edge] - b[edge]),
        `at 25% the ink ${edge} edge sits at ${f[edge].toFixed(4)} of the canvas but at ${b[edge].toFixed(4)} at 100%`,
      ).toBeLessThan(0.03);
    }
  });

  // Breakage caught: the 400% ceiling leaking - a further zoom-in that
  // re-rasterises at a larger scale would change the bitmap checksum.
  test("zoom-in past the 400% ceiling is a pixel-level no-op", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, JUSTIFIED_PDF);

    const three = await zoomTo(page, 3);
    requireInk(three.ink, "scale 3");

    for (let i = 0; i < 6; i++) {
      await page.getByTestId("v2-zoom-in").click();
    }
    await waitForBitmap(page, 4);
    await expect(page.getByTestId("v2-zoom-percent")).toHaveText("400%");
    const ceiling = await page.evaluate(snapshotFn);
    requireInk(ceiling.ink, "400% ceiling");
    expect(
      ceiling.ink.sig,
      "the 400% bitmap must differ from the 300% one, otherwise the no-op check below is vacuous",
    ).not.toBe(three.ink.sig);
    expect(
      ceiling.canvasW,
      `400% bitmap width should be round(${ceiling.pageW} * 4)`,
    ).toBe(Math.round(ceiling.pageW * 4));

    // Three more clicks at the ceiling.
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("v2-zoom-in").click();
    }
    await page.waitForTimeout(1200);
    const again = await page.evaluate(snapshotFn);

    await expect(page.getByTestId("v2-zoom-percent")).toHaveText("400%");
    expect(
      again.canvasW,
      `clicking zoom-in at the ceiling changed the bitmap width: ${again.canvasW} vs ${ceiling.canvasW}`,
    ).toBe(ceiling.canvasW);
    expect(
      again.ink.sig >>> 0,
      `clicking zoom-in at the ceiling changed the rendered pixels: ${again.ink.sig} vs ${ceiling.ink.sig}`,
    ).toBe(ceiling.ink.sig >>> 0);
    const run = requireRun(again, 0);
    const ink = await page.evaluate(runInkFn, run.id);
    requireInk(ink, "400% ceiling run");
    expectRegistered(
      ink.minX,
      run.left + RUN_BOX_INSET,
      4,
      "at the 400% ceiling",
    );
  });
});
