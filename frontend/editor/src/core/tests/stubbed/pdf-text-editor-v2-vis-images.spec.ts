import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Image-object regressions checked against the PIXELS PDFium paints, not just
// the model matrix or the HTML overlay. Every test here samples the page
// <canvas> so a change that updates the model while leaving the rendered
// bitmap stale (or vice versa) fails.
//
// Fixture: test-fixtures/sample.pdf, page 0, exactly one image object
// (135.72 x 68.16 pt at 93.48, 561.12) that renders as a dark, strongly
// left/right-asymmetric logo - which is what makes the flip test possible.

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");
const PNG = path.join(import.meta.dirname, "../test-fixtures/sample.png");

// NOTE: `[data-testid^="v2-image-"]` also matches the hidden `v2-image-input`
// file input. Image overlays are always `v2-image-p<page>-<obj>`.
const IMG_SEL = '[data-testid^="v2-image-p"]';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InkStats {
  /** Canvas-pixel window actually sampled. */
  box: { x0: number; y0: number; w: number; h: number };
  canvasW: number;
  canvasH: number;
  inked: number;
  /** Ink centroid, in canvas px relative to the window. */
  cx: number;
  cy: number;
  /** Tight bounding box of the ink, in canvas px relative to the window. */
  bbox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    w: number;
    h: number;
  };
  /** Ink in the left / right half of the window (mirror detection). */
  left: number;
  right: number;
  /** Ink in the top / bottom half of the window. */
  top: number;
  bottom: number;
}

/**
 * Sample the page bitmap under a client rect. "Ink" = any pixel that is not
 * near-white, which on this fixture is the image itself (the page around it
 * is bare white).
 */
async function inkStats(
  page: Page,
  rect: Rect,
  pageIdx = 0,
): Promise<InkStats> {
  const stats = await page.evaluate(
    ({ r, idx }: { r: Rect; idx: number }) => {
      const pageEl = document.querySelector(`[data-testid="v2-page-${idx}"]`);
      if (!pageEl) return { error: `no page ${idx}` } as const;
      const canvas = pageEl.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas || !canvas.width || !canvas.height)
        return { error: "page canvas has no bitmap" } as const;
      const cb = canvas.getBoundingClientRect();
      const sx = canvas.width / cb.width;
      const sy = canvas.height / cb.height;
      const x0 = Math.max(0, Math.round((r.x - cb.left) * sx));
      const y0 = Math.max(0, Math.round((r.y - cb.top) * sy));
      const w = Math.min(canvas.width - x0, Math.round(r.width * sx));
      const h = Math.min(canvas.height - y0, Math.round(r.height * sy));
      if (w <= 0 || h <= 0) return { error: "rect is off the bitmap" } as const;
      const d = canvas.getContext("2d")!.getImageData(x0, y0, w, h).data;
      let n = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = Number.MAX_SAFE_INTEGER;
      let maxX = -1;
      let minY = Number.MAX_SAFE_INTEGER;
      let maxY = -1;
      let left = 0;
      let right = 0;
      let top = 0;
      let bottom = 0;
      const halfW = Math.floor(w / 2);
      const halfH = Math.floor(h / 2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (d[i] >= 245 && d[i + 1] >= 245 && d[i + 2] >= 245) continue;
          n++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < halfW) left++;
          if (x >= w - halfW) right++;
          if (y < halfH) top++;
          if (y >= h - halfH) bottom++;
        }
      }
      return {
        box: { x0, y0, w, h },
        canvasW: canvas.width,
        canvasH: canvas.height,
        inked: n,
        cx: n ? sumX / n : -1,
        cy: n ? sumY / n : -1,
        bbox: {
          minX: n ? minX : -1,
          maxX,
          minY: n ? minY : -1,
          maxY,
          w: n ? maxX - minX + 1 : 0,
          h: n ? maxY - minY + 1 : 0,
        },
        left,
        right,
        top,
        bottom,
      };
    },
    { r: rect, idx: pageIdx },
  );
  if ("error" in stats) throw new Error(`inkStats: ${stats.error}`);
  return stats;
}

/** Mean luminance of each cell of a grid x grid tiling of a client rect. */
async function cellMeans(
  page: Page,
  rect: Rect,
  grid: number,
  pageIdx = 0,
): Promise<number[]> {
  const out = await page.evaluate(
    ({ r, g, idx }: { r: Rect; g: number; idx: number }) => {
      const pageEl = document.querySelector(`[data-testid="v2-page-${idx}"]`);
      const canvas = pageEl?.querySelector(
        "canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas || !canvas.width) return null;
      const cb = canvas.getBoundingClientRect();
      const sx = canvas.width / cb.width;
      const sy = canvas.height / cb.height;
      const x0 = Math.max(0, Math.round((r.x - cb.left) * sx));
      const y0 = Math.max(0, Math.round((r.y - cb.top) * sy));
      const w = Math.min(canvas.width - x0, Math.round(r.width * sx));
      const h = Math.min(canvas.height - y0, Math.round(r.height * sy));
      if (w < g || h < g) return null;
      const d = canvas.getContext("2d")!.getImageData(x0, y0, w, h).data;
      const sums = new Float64Array(g * g);
      const counts = new Float64Array(g * g);
      for (let y = 0; y < h; y++) {
        const gy = Math.min(g - 1, Math.floor((y * g) / h));
        for (let x = 0; x < w; x++) {
          const gx = Math.min(g - 1, Math.floor((x * g) / w));
          const i = (y * w + x) * 4;
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          sums[gy * g + gx] += lum;
          counts[gy * g + gx] += 1;
        }
      }
      return Array.from(sums, (s, i) => (counts[i] ? s / counts[i] : 255));
    },
    { r: rect, g: grid, idx: pageIdx },
  );
  if (!out) throw new Error("cellMeans: no usable bitmap for that rect");
  return out;
}

/** Cheap sampled fingerprint of the whole page bitmap. */
async function canvasSignature(page: Page, pageIdx = 0): Promise<string> {
  return page.evaluate((idx: number) => {
    const pageEl = document.querySelector(`[data-testid="v2-page-${idx}"]`);
    const canvas = pageEl?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas || !canvas.width) return "blank";
    const d = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < d.length; i += 4 * 11) {
      hash ^= d[i];
      hash = Math.imul(hash, 16777619);
    }
    return `${canvas.width}x${canvas.height}:${hash >>> 0}`;
  }, pageIdx);
}

/** Wait until PDFium has repainted the page to something other than `before`. */
async function waitForRepaint(
  page: Page,
  before: string,
  pageIdx = 0,
): Promise<string> {
  const deadline = Date.now() + 25_000;
  let candidate = "";
  let stableFor = 0;
  while (Date.now() < deadline) {
    const now = await canvasSignature(page, pageIdx);
    if (now !== before && now !== "blank") {
      if (now === candidate) {
        stableFor += 1;
        if (stableFor >= 2) return now;
      } else {
        candidate = now;
        stableFor = 0;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`page ${pageIdx} bitmap never repainted (was ${before})`);
}

async function openSample(page: Page): Promise<void> {
  await page.route("**/encode-charcodes", (route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

/** The fixture's single image overlay, plus its box and baseline ink. */
async function theImage(page: Page): Promise<{
  locator: ReturnType<Page["locator"]>;
  box: Rect;
  base: InkStats;
}> {
  const locator = page.locator(IMG_SEL).first();
  await expect(locator).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(IMG_SEL)).toHaveCount(1);
  const box = await locator.boundingBox();
  if (!box) throw new Error("image overlay has no bounding box");
  const base = await inkStats(page, box);
  // Precondition: the fixture's image really is drawn on the bitmap. Without
  // this guard every "ink moved / ink gone" assertion below could pass on an
  // empty page.
  expect(
    base.inked,
    `fixture precondition: the image must paint ink (box ${base.box.w}x${base.box.h})`,
  ).toBeGreaterThan(3000);
  return { locator, box, base };
}

async function selectImage(page: Page, locator: ReturnType<Page["locator"]>) {
  await locator.click();
  await expect(locator).toHaveCSS("outline-style", "solid");
  await page.waitForTimeout(200);
}

async function imageMenu(page: Page, itemTestId: string): Promise<void> {
  await page.getByTestId("v2-imgop-menu").click();
  await page.getByTestId(itemTestId).click();
}

/**
 * Drag from `from` to `to` with intermediate steps, so react-rnd tracks it.
 * Each step yields: WebKit delivers `steps:`-generated moves in one task, one
 * React batch collapses them, and the drag lands at a fraction of the
 * distance. A real pointer never produces two moves in the same task.
 */
async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  const STEPS = 12;
  for (let i = 1; i <= STEPS; i += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / STEPS,
      from.y + ((to.y - from.y) * i) / STEPS,
    );
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(120);
  await page.mouse.up();
}

test.describe("v2 editor - image objects, validated on the rendered bitmap", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/encode-charcodes", (route) => route.abort());
  });

  // Catches: a move that updates the overlay/model but leaves the PDFium
  // bitmap stale (ink still in the old box), or a CSS->PDF mapping bug that
  // shifts the ink by a different delta than the overlay.
  test("image move: ink leaves the old box and arrives intact in the new one", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, box, base } = await theImage(page);
    const sig = await canvasSignature(page);

    const DX = 250;
    const DY = 160;
    await dragMouse(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { x: box.x + box.width / 2 + DX, y: box.y + box.height / 2 + DY },
    );
    await waitForRepaint(page, sig);

    const moved = await locator.boundingBox();
    if (!moved) throw new Error("image overlay vanished after the drag");
    expect(
      Math.abs(moved.x - box.x - DX),
      `overlay moved by the drag dx (${(moved.x - box.x).toFixed(2)} vs ${DX})`,
    ).toBeLessThan(2);
    expect(
      Math.abs(moved.y - box.y - DY),
      `overlay moved by the drag dy (${(moved.y - box.y).toFixed(2)} vs ${DY})`,
    ).toBeLessThan(2);

    const atNew = await inkStats(page, moved);
    const atOld = await inkStats(page, box);
    expect(
      atNew.inked,
      `the moved image paints the same amount of ink at its new spot (was ${base.inked}, now ${atNew.inked})`,
    ).toBeGreaterThan(base.inked * 0.97);
    expect(atNew.inked).toBeLessThan(base.inked * 1.03);
    expect(
      Math.abs(atNew.cx - base.cx),
      "ink centroid keeps the same offset inside the box (x)",
    ).toBeLessThan(2);
    expect(
      Math.abs(atNew.cy - base.cy),
      "ink centroid keeps the same offset inside the box (y)",
    ).toBeLessThan(2);
    expect(
      atOld.inked,
      `the vacated box is repainted as bare page (${atOld.inked} ink px left of ${base.inked})`,
    ).toBeLessThan(base.inked * 0.05);
  });

  // Catches: a resize that only stretches the HTML handle while the PDF image
  // object keeps its old matrix, so the drawn bitmap never grows.
  test("image resize: a corner drag scales the drawn bitmap, not just the overlay", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, box, base } = await theImage(page);
    await selectImage(page, locator);
    const sig = await canvasSignature(page);

    const GROW_X = 90;
    const GROW_Y = 45;
    await dragMouse(
      page,
      { x: box.x + box.width - 2, y: box.y + box.height - 2 },
      { x: box.x + box.width + GROW_X, y: box.y + box.height + GROW_Y },
    );
    await waitForRepaint(page, sig);

    const grown = await locator.boundingBox();
    if (!grown) throw new Error("image overlay vanished after the resize");
    expect(
      grown.width - box.width,
      "overlay width follows the corner drag",
    ).toBeGreaterThan(GROW_X - 6);
    expect(
      grown.height - box.height,
      "overlay height follows the corner drag",
    ).toBeGreaterThan(GROW_Y - 6);

    const after = await inkStats(page, grown);
    const boxRatioX = grown.width / box.width;
    const boxRatioY = grown.height / box.height;
    const inkRatioX = after.bbox.w / base.bbox.w;
    const inkRatioY = after.bbox.h / base.bbox.h;
    expect(
      inkRatioX,
      `drawn ink widened with the box (box x${boxRatioX.toFixed(3)}, ink x${inkRatioX.toFixed(3)})`,
    ).toBeGreaterThan(boxRatioX - 0.06);
    expect(inkRatioX).toBeLessThan(boxRatioX + 0.06);
    expect(
      inkRatioY,
      `drawn ink heightened with the box (box x${boxRatioY.toFixed(3)}, ink x${inkRatioY.toFixed(3)})`,
    ).toBeGreaterThan(boxRatioY - 0.06);
    expect(inkRatioY).toBeLessThan(boxRatioY + 0.06);
    expect(
      after.inked,
      `a bigger image paints materially more ink (${base.inked} -> ${after.inked})`,
    ).toBeGreaterThan(base.inked * 1.5);
  });

  // Catches: a shrink that never re-rasterises, leaving the previous, larger
  // image painted in the strip the new box no longer covers.
  test("image resize: shrinking repaints the strip the image vacated", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, box } = await theImage(page);
    await selectImage(page, locator);
    const sig = await canvasSignature(page);

    await dragMouse(
      page,
      { x: box.x + box.width - 2, y: box.y + box.height - 2 },
      { x: box.x + box.width - 100, y: box.y + box.height - 50 },
    );
    await waitForRepaint(page, sig);

    const small = await locator.boundingBox();
    if (!small) throw new Error("image overlay vanished after the resize");
    expect(small.width, "overlay actually got narrower").toBeLessThan(
      box.width - 80,
    );

    const inside = await inkStats(page, small);
    expect(
      inside.inked,
      "the shrunken image is still drawn (guards against a vacuous empty-strip pass)",
    ).toBeGreaterThan(800);

    const stripX = small.x + small.width + 3;
    const stripW = box.x + box.width - stripX;
    expect(stripW, "vacated strip is wide enough to sample").toBeGreaterThan(
      40,
    );
    const strip = await inkStats(page, {
      x: stripX,
      y: box.y,
      width: stripW,
      height: box.height,
    });
    expect(
      strip.inked,
      `the strip the image vacated is bare page again (${strip.inked} ink px over ${strip.box.w}x${strip.box.h})`,
    ).toBeLessThan(20);
  });

  // Catches: a delete that drops the overlay/model entry but leaves the object
  // in PDFium's page object list, so the picture stays visible.
  test("image delete: the box it occupied is repainted as bare page", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, box, base } = await theImage(page);
    await selectImage(page, locator);
    const sig = await canvasSignature(page);

    await page.getByTestId("v2-delete").click();
    await expect(page.locator(IMG_SEL)).toHaveCount(0);
    await waitForRepaint(page, sig);

    const after = await inkStats(page, box);
    expect(
      after.inked,
      `nothing is drawn where the image was (${base.inked} -> ${after.inked} ink px)`,
    ).toBeLessThan(20);
  });

  // Catches: an undo that re-adds the image object at a different index /
  // matrix, or with the pixels lost - the bitmap would come back subtly
  // different rather than identical.
  test("image delete then undo: the bitmap comes back cell-for-cell", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, box, base } = await theImage(page);
    const before = await cellMeans(page, box, 16);
    expect(before.length, "16x16 fingerprint sampled").toBe(256);
    const spread = Math.max(...before) - Math.min(...before);
    expect(
      spread,
      "fingerprint has real contrast, so a match is meaningful",
    ).toBeGreaterThan(40);

    await selectImage(page, locator);
    const sig = await canvasSignature(page);
    await page.getByTestId("v2-delete").click();
    const gone = await waitForRepaint(page, sig);

    await page.getByTestId("v2-undo").click();
    await expect(page.locator(IMG_SEL)).toHaveCount(1);
    await waitForRepaint(page, gone);

    const restoredBox = await page.locator(IMG_SEL).first().boundingBox();
    if (!restoredBox) throw new Error("restored image overlay has no box");
    expect(
      Math.abs(restoredBox.x - box.x),
      "restored overlay is back at the same x",
    ).toBeLessThan(1);
    expect(
      Math.abs(restoredBox.y - box.y),
      "restored overlay is back at the same y",
    ).toBeLessThan(1);

    const after = await cellMeans(page, box, 16);
    let worstCell = -1;
    let worstDelta = 0;
    for (let i = 0; i < before.length; i++) {
      const delta = Math.abs(after[i] - before[i]);
      if (delta > worstDelta) {
        worstDelta = delta;
        worstCell = i;
      }
    }
    expect(
      worstDelta,
      `every one of 256 cells repaints to its original luminance (worst cell ${worstCell}: ${worstDelta.toFixed(2)})`,
    ).toBeLessThan(1);
    const restoredInk = await inkStats(page, box);
    expect(restoredInk.inked, "ink pixel count restored exactly").toBe(
      base.inked,
    );
  });

  // Catches: a replace that re-embeds at the embed helper's axis-aligned box
  // (image jumps / resizes) or that leaves the original pixels on screen.
  test("image replace: the box is untouched but its pixels are repainted", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, box } = await theImage(page);
    const before = await cellMeans(page, box, 16);
    await selectImage(page, locator);
    const sig = await canvasSignature(page);

    const chooser = page.waitForEvent("filechooser");
    await imageMenu(page, "v2-imgop-replace");
    await (await chooser).setFiles(PNG);
    await waitForRepaint(page, sig);

    const after = await locator.boundingBox();
    if (!after) throw new Error("image overlay vanished after the replace");
    expect(after.x, "replacement keeps the same left edge").toBeCloseTo(
      box.x,
      0,
    );
    expect(after.y, "replacement keeps the same top edge").toBeCloseTo(
      box.y,
      0,
    );
    expect(after.width, "replacement keeps the same width").toBeCloseTo(
      box.width,
      0,
    );
    expect(after.height, "replacement keeps the same height").toBeCloseTo(
      box.height,
      0,
    );

    const stats = await inkStats(page, box);
    expect(
      stats.inked,
      "the replacement actually paints something (no blank-box pass)",
    ).toBeGreaterThan(1000);

    const now = await cellMeans(page, box, 16);
    let changed = 0;
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(now[i] - before[i]) > 15) changed += 1;
    }
    expect(
      changed,
      `the pixels inside the box are a different picture (${changed}/256 cells changed by >15 luminance)`,
    ).toBeGreaterThan(90);
  });

  // Catches: rotate-cw writing a matrix PDFium then draws unrotated, or the
  // overlay box rotating while the bitmap does not (and vice versa).
  test("image rotate 90 right: the drawn bitmap stands on its side", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, base } = await theImage(page);
    const baseAspect = base.bbox.w / base.bbox.h;
    expect(
      baseAspect,
      `fixture precondition: the image is landscape (${base.bbox.w}x${base.bbox.h})`,
    ).toBeGreaterThan(1.8);

    await selectImage(page, locator);
    const sig = await canvasSignature(page);
    await imageMenu(page, "v2-imgop-rotate-cw");
    await waitForRepaint(page, sig);

    const rotated = await locator.boundingBox();
    if (!rotated) throw new Error("image overlay vanished after the rotate");
    expect(rotated.width, "overlay box turned portrait").toBeLessThan(
      rotated.height,
    );

    const after = await inkStats(page, rotated);
    const aspect = after.bbox.w / after.bbox.h;
    expect(
      aspect,
      `drawn ink is portrait after the rotate (${after.bbox.w}x${after.bbox.h}, aspect ${aspect.toFixed(2)} vs ${baseAspect.toFixed(2)})`,
    ).toBeLessThan(0.7);
    expect(
      after.bbox.w / base.bbox.h,
      "rotated ink width matches the original ink height",
    ).toBeGreaterThan(0.9);
    expect(after.bbox.w / base.bbox.h).toBeLessThan(1.1);
    expect(
      after.bbox.h / base.bbox.w,
      "rotated ink height matches the original ink width",
    ).toBeGreaterThan(0.9);
    expect(after.bbox.h / base.bbox.w).toBeLessThan(1.1);
  });

  // Catches: flip-h negating the matrix without PDFium redrawing the mirrored
  // pixels, or a flip that lands on the wrong axis.
  test("image flip horizontal: the drawn pixels mirror, not only the matrix", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, base } = await theImage(page);
    // Precondition: the picture is lopsided left-to-right, otherwise a mirror
    // would be undetectable in the half-counts.
    const lopsided =
      Math.max(base.left, base.right) /
      Math.max(1, Math.min(base.left, base.right));
    expect(
      lopsided,
      `fixture precondition: image is left/right asymmetric (left ${base.left}, right ${base.right})`,
    ).toBeGreaterThan(1.5);

    await selectImage(page, locator);
    const sig = await canvasSignature(page);
    await imageMenu(page, "v2-imgop-flip-h");
    await waitForRepaint(page, sig);

    const flippedBox = await locator.boundingBox();
    if (!flippedBox) throw new Error("image overlay vanished after the flip");
    const after = await inkStats(page, flippedBox);
    expect(
      after.inked,
      `a mirror moves ink, it does not add or remove it (${base.inked} -> ${after.inked})`,
    ).toBeGreaterThan(base.inked * 0.98);
    expect(after.inked).toBeLessThan(base.inked * 1.02);
    expect(
      after.left / base.right,
      `the left half now carries what the right half carried (${base.right} -> ${after.left})`,
    ).toBeGreaterThan(0.95);
    expect(after.left / base.right).toBeLessThan(1.05);
    expect(
      after.right / base.left,
      `the right half now carries what the left half carried (${base.left} -> ${after.right})`,
    ).toBeGreaterThan(0.95);
    expect(after.right / base.left).toBeLessThan(1.05);
    // A vertical flip would leave the halves alone; make sure that is not
    // what happened.
    expect(
      Math.abs(after.top - base.top),
      "the vertical distribution of ink is unchanged",
    ).toBeLessThan(base.top * 0.05);
  });

  // Catches: an insert that registers an image in the model and draws an
  // overlay while PDFium paints nothing (or paints outside the overlay).
  test("image insert: the picked PNG paints ink where the page was blank", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    await expect(page.locator(IMG_SEL)).toHaveCount(1);
    const sig = await canvasSignature(page);

    await page.locator('[data-testid="v2-image-input"]').setInputFiles(PNG);
    await expect(page.locator(IMG_SEL)).toHaveCount(2, { timeout: 30_000 });
    const afterInsert = await waitForRepaint(page, sig);

    const insertedBox = await page.locator(IMG_SEL).last().boundingBox();
    if (!insertedBox) throw new Error("inserted overlay has no bounding box");
    const painted = await inkStats(page, insertedBox);
    expect(
      painted.inked,
      `the inserted PNG is really on the bitmap (${painted.inked} ink px in ${painted.box.w}x${painted.box.h})`,
    ).toBeGreaterThan(3000);
    expect(
      painted.bbox.w / painted.box.w,
      "the drawn picture fills its overlay horizontally",
    ).toBeGreaterThan(0.95);
    expect(
      painted.bbox.h / painted.box.h,
      "the drawn picture fills its overlay vertically",
    ).toBeGreaterThan(0.95);

    // Undo puts the page back, which is what proves the ink above was the
    // insert and not something already printed there.
    await page.getByTestId("v2-undo").click();
    await expect(page.locator(IMG_SEL)).toHaveCount(1);
    await waitForRepaint(page, afterInsert);
    const wasBlank = await inkStats(page, insertedBox);
    expect(
      wasBlank.inked,
      `that region was blank before the insert (${wasBlank.inked} vs ${painted.inked} ink px)`,
    ).toBeLessThan(painted.inked * 0.1);
  });

  // Catches: losing the react-rnd `bounds="parent"` clamp, or a clamp applied
  // to the HTML box only - the image would be committed with a matrix that
  // hangs off the page, and part of its ink would be cropped away by the
  // page edge.
  test("image move: a drag past the page edge clamps on-page with nothing cropped", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSample(page);
    const { locator, box, base } = await theImage(page);
    const pageBox = await page.getByTestId("v2-page-0").boundingBox();
    if (!pageBox) throw new Error("page 0 has no bounding box");
    // Precondition: the image starts well inside the page, so a clamp is
    // something the drag has to produce rather than the status quo.
    expect(
      box.x - pageBox.x,
      "image starts away from the left page edge",
    ).toBeGreaterThan(100);
    expect(
      box.y - pageBox.y,
      "image starts away from the top page edge",
    ).toBeGreaterThan(100);
    const sig = await canvasSignature(page);

    // Aim well past the page's top-left corner; the clamp has to absorb it.
    await dragMouse(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { x: pageBox.x - 300, y: pageBox.y - 50 },
    );
    await waitForRepaint(page, sig);

    const moved = await locator.boundingBox();
    if (!moved) throw new Error("image overlay vanished after the drag");
    expect(
      moved.x,
      `overlay is not dragged off the left page edge (${moved.x.toFixed(2)} vs page ${pageBox.x})`,
    ).toBeGreaterThan(pageBox.x - 1);
    expect(
      moved.y,
      `overlay is not dragged off the top page edge (${moved.y.toFixed(2)} vs page ${pageBox.y})`,
    ).toBeGreaterThan(pageBox.y - 1);
    expect(
      moved.x - pageBox.x,
      "the clamp pins it to the edge rather than leaving it mid-page",
    ).toBeLessThan(2);
    expect(
      box.x - moved.x,
      "the drag actually travelled a long way left",
    ).toBeGreaterThan(100);
    expect(moved.width, "clamping must not squash the box").toBeCloseTo(
      box.width,
      1,
    );

    // The whole picture is still painted: had the object been committed with
    // an off-page matrix, PDFium would have cropped the overhang away.
    const after = await inkStats(page, moved);
    expect(
      after.inked,
      `every ink pixel survived the clamped move (${base.inked} -> ${after.inked})`,
    ).toBeGreaterThan(base.inked * 0.98);
    expect(after.inked).toBeLessThan(base.inked * 1.02);
    expect(
      after.bbox.minX,
      "ink still starts inside the box, not shaved off at x=0",
    ).toBeGreaterThan(0);
    expect(
      after.bbox.minY,
      "ink still starts inside the box, not shaved off at y=0",
    ).toBeGreaterThan(0);
    expect(
      Math.abs(after.bbox.w - base.bbox.w),
      `the drawn picture kept its full width (${base.bbox.w} -> ${after.bbox.w})`,
    ).toBeLessThan(3);
    expect(
      Math.abs(after.bbox.h - base.bbox.h),
      `the drawn picture kept its full height (${base.bbox.h} -> ${after.bbox.h})`,
    ).toBeLessThan(3);
  });
});
