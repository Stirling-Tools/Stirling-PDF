import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

/**
 * Visual validation of the v2 editor's multi-page rendering.
 *
 * Every assertion here is derived from the pixels PDFium actually painted into
 * each page's <canvas>, not from the store. The editor frees an off-screen
 * page's bitmap (`canvas.width = 0`, ~4MB per A4 page at 1.5x) and re-renders
 * it on return, so the whole family of "the page came back wrong" bugs -
 * blank canvas, stale bitmap, wrong scale, a page painting its neighbour's
 * content, layout drifting as bitmaps come and go - is only catchable by
 * comparing ink before and after a scroll.
 *
 * many-pages-sample.pdf is 8 pages of 612x792 with two 18pt Helvetica lines
 * each ("Page N line 1/2"). At the default 1.5x render scale that is a
 * 918x1188 canvas whose ink lands in two horizontal bands. The per-page glyph
 * differs only in one digit, which makes the dark-pixel count a unique,
 * deterministic fingerprint per page - used below to prove page identity from
 * pixels alone.
 */

const MANY_PAGES_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

const TOTAL_PAGES = 8;
/** 612 x 792 pt at the 1.5x default render scale. */
const RASTER_W = 918;
const RASTER_H = 1188;
/** Pages 5..7 sit past the loader's EAGER_PAGE_LIMIT of 5. */
const FIRST_LAZY_PAGE = 5;

type Page = import("@playwright/test").Page;

interface PageScan {
  present: boolean;
  /** The canvas still holds a backing store (i.e. the bitmap was not freed). */
  live: boolean;
  ink: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Contiguous runs of rows that carry at least one dark pixel. */
  bands: number[][];
  /** Row/column ink profiles folded into one integer each. */
  rowSig: number;
  colSig: number;
  w: number;
  h: number;
  boxW: number;
  boxH: number;
  boxTop: number;
  boxLeft: number;
  placeholder: boolean;
  errorOverlay: boolean;
  runs: number;
  /** Ink bounding box in viewport coordinates, or null when not live. */
  clientInk: { x0: number; y0: number; x1: number; y1: number } | null;
}

/**
 * Read one page's canvas back and reduce it to an ink summary. "Ink" is a
 * pixel dark in both red and green - the fixture is black text on white.
 */
function scanPage(p: Page, idx: number): Promise<PageScan> {
  return p.evaluate((i) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="v2-page-${i}"]`,
    );
    const empty: PageScan = {
      present: false,
      live: false,
      ink: 0,
      minX: -1,
      minY: -1,
      maxX: -1,
      maxY: -1,
      bands: [],
      rowSig: 0,
      colSig: 0,
      w: 0,
      h: 0,
      boxW: 0,
      boxH: 0,
      boxTop: 0,
      boxLeft: 0,
      placeholder: false,
      errorOverlay: false,
      runs: 0,
      clientInk: null,
    };
    if (!el) return empty;
    const box = el.getBoundingClientRect();
    const base = {
      ...empty,
      present: true,
      boxW: Math.round(box.width),
      boxH: Math.round(box.height),
      boxTop: Math.round(box.top),
      boxLeft: Math.round(box.left),
      placeholder: !!el.querySelector(
        `[data-testid="v2-page-${i}-placeholder"]`,
      ),
      errorOverlay: !!el.querySelector(`[data-testid="v2-page-${i}-error"]`),
      runs: el.querySelectorAll("[data-testid^='v2-run-']").length,
    };
    const c = el.querySelector("canvas");
    if (!c || c.width === 0 || c.height === 0) return base;
    const ctx = c.getContext("2d");
    if (!ctx) return base;
    const cb = c.getBoundingClientRect();
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const rows = new Array<number>(c.height).fill(0);
    const cols = new Array<number>(c.width).fill(0);
    let ink = 0;
    let minX = Number.MAX_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < c.height; y++) {
      const rowStart = y * c.width * 4;
      for (let x = 0; x < c.width; x++) {
        const o = rowStart + x * 4;
        if (data[o] < 160 && data[o + 1] < 160) {
          ink++;
          rows[y]++;
          cols[x]++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    let rowSig = 0;
    for (let y = 0; y < rows.length; y++) rowSig += rows[y] * (y + 1);
    let colSig = 0;
    for (let x = 0; x < cols.length; x++) colSig += cols[x] * (x + 1);
    const bands: number[][] = [];
    let start = -1;
    for (let y = 0; y < rows.length; y++) {
      if (rows[y] > 0 && start < 0) start = y;
      if (rows[y] === 0 && start >= 0) {
        bands.push([start, y - 1]);
        start = -1;
      }
    }
    if (start >= 0) bands.push([start, rows.length - 1]);
    const sx = c.width / cb.width;
    const sy = c.height / cb.height;
    return {
      ...base,
      live: true,
      ink,
      minX,
      minY,
      maxX,
      maxY,
      bands,
      rowSig,
      colSig,
      w: c.width,
      h: c.height,
      clientInk:
        ink === 0
          ? null
          : {
              x0: Math.round(cb.left + minX / sx),
              y0: Math.round(cb.top + minY / sy),
              x1: Math.round(cb.left + maxX / sx),
              y1: Math.round(cb.top + maxY / sy),
            },
    };
  }, idx);
}

/** Ink pixels that fall inside one of the page's own run overlay boxes. */
function scanRunCoverage(p: Page, idx: number) {
  return p.evaluate((i) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="v2-page-${i}"]`,
    );
    const c = el?.querySelector("canvas");
    if (!el || !c || c.width === 0) return null;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const cb = c.getBoundingClientRect();
    const sx = c.width / cb.width;
    const sy = c.height / cb.height;
    const PAD = 2;
    const boxes = Array.from(
      el.querySelectorAll<HTMLElement>("[data-testid^='v2-run-']"),
    ).map((r) => {
      const rr = r.getBoundingClientRect();
      return {
        id: r.dataset.testid ?? "?",
        x0: (rr.left - cb.left) * sx - PAD,
        y0: (rr.top - cb.top) * sy - PAD,
        x1: (rr.right - cb.left) * sx + PAD,
        y1: (rr.bottom - cb.top) * sy + PAD,
        ink: 0,
      };
    });
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let total = 0;
    let covered = 0;
    for (let y = 0; y < c.height; y++) {
      const rowStart = y * c.width * 4;
      for (let x = 0; x < c.width; x++) {
        const o = rowStart + x * 4;
        if (data[o] >= 160 || data[o + 1] >= 160) continue;
        total++;
        let hit = false;
        for (const b of boxes) {
          if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) {
            b.ink++;
            hit = true;
          }
        }
        if (hit) covered++;
      }
    }
    return { total, covered, boxes };
  }, idx);
}

async function openV2(p: Page, file: string) {
  await p.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(p.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await p.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(p.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await p.waitForTimeout(1500);
}

/** Scroll a page to the middle of the stage and wait for its bitmap. */
async function showPage(p: Page, idx: number) {
  await p.evaluate((i) => {
    document
      .querySelector<HTMLElement>(`[data-testid="v2-page-${i}"]`)
      ?.scrollIntoView({ block: "center" });
  }, idx);
  await p.waitForFunction(
    (i) => {
      const el = document.querySelector(`[data-testid="v2-page-${i}"]`);
      const c = el?.querySelector("canvas");
      return !!c && c.width > 0 && c.height > 0;
    },
    idx,
    { timeout: 30_000 },
  );
  await p.waitForTimeout(400);
}

/** Wait until a page's bitmap has been released. */
async function waitFreed(p: Page, idx: number) {
  await p.waitForFunction(
    (i) => {
      const el = document.querySelector(`[data-testid="v2-page-${i}"]`);
      const c = el?.querySelector("canvas");
      return !!c && c.width === 0;
    },
    idx,
    { timeout: 30_000 },
  );
}

/** Poll a page's ink until `ready`, so async re-renders are not raced. */
async function waitForScan(
  p: Page,
  idx: number,
  ready: (s: PageScan) => boolean,
  label: string,
): Promise<PageScan> {
  let last: PageScan | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    last = await scanPage(p, idx);
    if (last.live && ready(last)) return last;
    await p.waitForTimeout(500);
  }
  throw new Error(
    `timed out waiting for ${label}; last scan = ${JSON.stringify(last)}`,
  );
}

/** Indices whose canvas still has a backing store, and their total pixels. */
function liveBitmaps(p: Page) {
  return p.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid^='v2-page-']"),
    ).filter((el) => /^v2-page-\d+$/.test(el.dataset.testid ?? ""));
    const live: number[] = [];
    let pixels = 0;
    for (const el of els) {
      const c = el.querySelector("canvas");
      if (c && c.width > 0 && c.height > 0) {
        live.push(Number((el.dataset.testid ?? "").replace("v2-page-", "")));
        pixels += c.width * c.height;
      }
    }
    return { live, pixels, pageCount: els.length };
  });
}

function bbox(s: PageScan) {
  return [s.minX, s.minY, s.maxX, s.maxY];
}

test.describe("v2 editor - multi-page rendering (pixel evidence)", () => {
  test.describe.configure({ timeout: 120_000 });

  // Would catch: a page rendering blank, at the wrong scale, or with its ink
  // vertically offset (the classic "page N drew page N+1's content shifted"
  // rasteriser bug). Every page of this fixture has the same two-line layout,
  // so the bands and bbox must agree to the pixel across all eight.
  test("each of the eight pages rasterises two ink bands at the same canvas rows", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    const scans: PageScan[] = [];
    for (let i = 0; i < TOTAL_PAGES; i++) {
      await showPage(page, i);
      scans.push(await scanPage(page, i));
    }

    expect(scans.length, "all eight pages must have been scanned").toBe(
      TOTAL_PAGES,
    );
    const reference = scans[0];
    expect(
      reference.ink,
      "page 0 must actually carry ink - a blank scan would make the rest vacuous",
    ).toBeGreaterThan(800);

    for (let i = 0; i < TOTAL_PAGES; i++) {
      const s = scans[i];
      expect(s.errorOverlay, `page ${i} rendered an error overlay`).toBe(false);
      expect([s.w, s.h], `page ${i} canvas size`).toEqual([RASTER_W, RASTER_H]);
      expect(
        s.ink,
        `page ${i} ink pixels (blank or over-painted page?)`,
      ).toBeGreaterThan(800);
      expect(s.ink, `page ${i} ink pixels`).toBeLessThan(4000);
      expect(
        s.bands.length,
        `page ${i} should paint exactly two text bands, got ${JSON.stringify(s.bands)}`,
      ).toBe(2);
      expect(
        s.bands,
        `page ${i} band rows must match page 0's (${JSON.stringify(reference.bands)})`,
      ).toEqual(reference.bands);
      expect(bbox(s), `page ${i} ink bounding box must match page 0's`).toEqual(
        bbox(reference),
      );
    }
  });

  // Would catch: a returning page repainting from a stale/partial bitmap, at a
  // different offset, or not at all. rowSig/colSig are the full ink profiles,
  // so a one-pixel shift in either axis fails this.
  test("a page freed while off-screen repaints pixel-identically on the way back", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    const before = await scanPage(page, 0);
    expect(before.live, "page 0 must be rendered before we scroll away").toBe(
      true,
    );
    expect(before.ink, "page 0 ink before scrolling away").toBeGreaterThan(800);

    await showPage(page, TOTAL_PAGES - 1);
    await waitFreed(page, 0);

    const freed = await scanPage(page, 0);
    expect(freed.live, "page 0's bitmap must be released off-screen").toBe(
      false,
    );
    expect(freed.placeholder, "freed page 0 must show its placeholder").toBe(
      true,
    );
    expect(
      [freed.boxW, freed.boxH],
      "freeing the bitmap must not resize the page box",
    ).toEqual([RASTER_W, RASTER_H]);

    await showPage(page, 0);
    const after = await waitForScan(
      page,
      0,
      (s) => s.ink > 0,
      "page 0 to repaint",
    );

    expect(after.ink, "ink count after the round trip").toBe(before.ink);
    expect(bbox(after), "ink bounding box after the round trip").toEqual(
      bbox(before),
    );
    expect(after.bands, "band rows after the round trip").toEqual(before.bands);
    expect(after.rowSig, "row ink profile after the round trip").toBe(
      before.rowSig,
    );
    expect(after.colSig, "column ink profile after the round trip").toBe(
      before.colSig,
    );
  });

  // Would catch: pages re-rendering out of order after a full scroll, i.e.
  // index N repainting some other page's bitmap. Each page's dark-pixel count
  // is unique (the digit in "Page N line 1" differs), so the fingerprint is
  // page identity read straight off the canvas.
  test("page order survives a full scroll: each index repaints its own ink fingerprint", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    const forward: number[] = [];
    for (let i = 0; i < TOTAL_PAGES; i++) {
      await showPage(page, i);
      const s = await scanPage(page, i);
      expect(
        s.ink,
        `page ${i} must paint ink on the first pass`,
      ).toBeGreaterThan(800);
      forward.push(s.ink);
    }
    // Guard: the whole test is meaningless if the fingerprints collide.
    expect(
      new Set(forward).size,
      `ink fingerprints must be unique per page, got ${JSON.stringify(forward)}`,
    ).toBe(TOTAL_PAGES);

    const mismatches: string[] = [];
    for (let i = TOTAL_PAGES - 1; i >= 0; i--) {
      await showPage(page, i);
      const s = await scanPage(page, i);
      if (s.ink !== forward[i]) {
        const impostor = forward.indexOf(s.ink);
        mismatches.push(
          `page ${i} repainted ${s.ink} ink px, expected ${forward[i]}` +
            (impostor >= 0 ? ` (that is page ${impostor}'s bitmap)` : ""),
        );
      }
    }
    expect(mismatches, "pages must repaint their own content").toEqual([]);
  });

  // Would catch: run overlays drifting off the glyphs they edit, or a page's
  // runs being positioned from another page's geometry - the overlay boxes
  // would then stop covering the ink they claim to own.
  test("every inked pixel on a page sits under one of that page's own run overlays", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    for (const idx of [0, 3]) {
      await showPage(page, idx);
      const cov = await scanRunCoverage(page, idx);
      expect(
        cov,
        `page ${idx} coverage scan should not be null`,
      ).not.toBeNull();
      if (!cov) continue;
      expect(cov.boxes.length, `page ${idx} must expose two run overlays`).toBe(
        2,
      );
      expect(
        cov.total,
        `page ${idx} must have ink to attribute`,
      ).toBeGreaterThan(800);
      const ratio = cov.covered / cov.total;
      expect(
        ratio,
        `page ${idx}: ${cov.total - cov.covered} of ${cov.total} ink pixels fall outside every run box`,
      ).toBeGreaterThan(0.99);
      for (const b of cov.boxes) {
        expect(
          b.ink,
          `run ${b.id} covers only ${b.ink} ink pixels - its box is off the glyphs`,
        ).toBeGreaterThan(300);
      }
    }
  });

  // Would catch: the lazy page pipeline breaking in either direction - a page
  // past the eager window never rendering, or the editor eagerly rasterising
  // (and holding) every page's bitmap up front.
  test("a page past the eager window stays blank with no runs until scrolled in", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);
    const last = TOTAL_PAGES - 1;

    const cold = await scanPage(page, last);
    expect(cold.present, `page ${last} must exist in the DOM up front`).toBe(
      true,
    );
    expect(
      cold.live,
      `page ${last} must not hold a bitmap before it is scrolled to`,
    ).toBe(false);
    expect(cold.placeholder, `page ${last} must show its placeholder`).toBe(
      true,
    );
    expect(
      cold.runs,
      `page ${last} is past the eager window (${FIRST_LAZY_PAGE}) so it should carry no runs yet`,
    ).toBe(0);
    // Page 0 is painted, which proves the "no ink" reading above is a real
    // state and not a broken selector.
    const first = await scanPage(page, 0);
    expect(first.ink, "page 0 must be painted for contrast").toBeGreaterThan(
      800,
    );

    await showPage(page, last);
    const warm = await waitForScan(
      page,
      last,
      (s) => s.ink > 800 && s.runs === 2,
      `page ${last} to paint and populate`,
    );
    expect(warm.placeholder, "placeholder must be gone once painted").toBe(
      false,
    );
    expect([warm.w, warm.h], `page ${last} canvas size`).toEqual([
      RASTER_W,
      RASTER_H,
    ]);
    expect(warm.bands.length, `page ${last} should paint two text bands`).toBe(
      2,
    );

    const cov = await scanRunCoverage(page, last);
    expect(cov, "coverage scan").not.toBeNull();
    expect(
      cov ? cov.covered / cov.total : 0,
      `page ${last}'s freshly-loaded runs must land on its freshly-painted ink`,
    ).toBeGreaterThan(0.99);
  });

  // Would catch: an edit being lost or re-rendered from the pre-edit model when
  // its page is freed and restored, and edits leaking onto a neighbouring page.
  test("an edit on page index 5 repaints after a round trip while page index 4 stays pixel-identical", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    await showPage(page, 4);
    const neighbourBefore = await scanPage(page, 4);
    expect(neighbourBefore.ink, "page 4 ink before the edit").toBeGreaterThan(
      800,
    );

    await showPage(page, FIRST_LAZY_PAGE);
    const targetBefore = await waitForScan(
      page,
      FIRST_LAZY_PAGE,
      (s) => s.ink > 800 && s.runs === 2,
      "page 5 to paint and populate",
    );

    const runId = await page.evaluate((i) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-page-${i}"]`,
      );
      return (
        el?.querySelector<HTMLElement>("[data-testid^='v2-run-']")?.dataset
          .testid ?? null
      );
    }, FIRST_LAZY_PAGE);
    expect(runId, "page 5 must expose an editable run").not.toBeNull();

    await page.evaluate((id) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${id}"]`,
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
      document.execCommand("insertText", false, " WWWW");
    }, runId);

    const targetAfter = await waitForScan(
      page,
      FIRST_LAZY_PAGE,
      (s) => s.maxX > targetBefore.maxX + 20,
      "page 5's bitmap to widen with the appended text",
    );
    expect(
      targetAfter.ink,
      "the appended glyphs must add ink to page 5",
    ).toBeGreaterThan(targetBefore.ink);

    await showPage(page, 0);
    await waitFreed(page, FIRST_LAZY_PAGE);
    await showPage(page, FIRST_LAZY_PAGE);
    const targetRestored = await waitForScan(
      page,
      FIRST_LAZY_PAGE,
      (s) => s.ink > 0,
      "page 5 to repaint after the round trip",
    );

    expect(
      targetRestored.ink,
      "page 5 must repaint the edited text, not the original",
    ).toBe(targetAfter.ink);
    expect(bbox(targetRestored), "page 5 ink box after the round trip").toEqual(
      bbox(targetAfter),
    );
    expect(
      targetRestored.rowSig,
      "page 5 row profile after the round trip",
    ).toBe(targetAfter.rowSig);

    await showPage(page, 4);
    const neighbourAfter = await waitForScan(
      page,
      4,
      (s) => s.ink > 0,
      "page 4 to repaint",
    );
    expect(
      neighbourAfter.ink,
      "the edit on page 5 must not change page 4's pixels",
    ).toBe(neighbourBefore.ink);
    expect(neighbourAfter.rowSig, "page 4 row profile").toBe(
      neighbourBefore.rowSig,
    );
    expect(neighbourAfter.colSig, "page 4 column profile").toBe(
      neighbourBefore.colSig,
    );
  });

  // Would catch: a zoom change resizing the CSS box without re-rasterising (a
  // blurry upscale), or re-rasterising with the ink at the old absolute
  // offsets so the text creeps across the page as you zoom.
  test("zooming out re-rasterises the page smaller with the ink in the same relative box", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    const at150 = await scanPage(page, 0);
    expect(at150.live, "page 0 must be painted at the default zoom").toBe(true);
    expect([at150.w, at150.h], "default raster size").toEqual([
      RASTER_W,
      RASTER_H,
    ]);
    const rel = (s: PageScan) => ({
      x0: s.minX / s.w,
      y0: s.minY / s.h,
      x1: s.maxX / s.w,
      y1: s.maxY / s.h,
    });
    const relBefore = rel(at150);

    await page.getByTestId("v2-zoom-out").click();
    const at125 = await waitForScan(
      page,
      0,
      (s) => s.w !== RASTER_W && s.ink > 0,
      "page 0 to re-rasterise at the smaller zoom",
    );
    expect(
      at125.w,
      "zoom out must shrink the backing bitmap, not just the CSS box",
    ).toBe(765);
    expect(at125.h, "zoom out raster height").toBe(990);
    expect(
      [at125.boxW, at125.boxH],
      "CSS box must track the new raster size",
    ).toEqual([765, 990]);
    expect(
      at125.ink,
      "the smaller raster must still carry text",
    ).toBeGreaterThan(500);
    expect(at125.bands.length, "band count at 125%").toBe(2);

    const relAfter = rel(at125);
    for (const k of ["x0", "y0", "x1", "y1"] as const) {
      expect(
        Math.abs(relAfter[k] - relBefore[k]),
        `relative ink ${k} moved from ${relBefore[k].toFixed(4)} to ${relAfter[k].toFixed(4)} when zooming out`,
      ).toBeLessThan(0.006);
    }

    await page.getByTestId("v2-zoom-in").click();
    const back = await waitForScan(
      page,
      0,
      (s) => s.w === RASTER_W && s.ink > 0,
      "page 0 to re-rasterise back at 150%",
    );
    expect(back.ink, "returning to 150% must reproduce the original ink").toBe(
      at150.ink,
    );
    expect(bbox(back), "returning to 150% must reproduce the ink box").toEqual(
      bbox(at150),
    );
    expect(back.rowSig, "returning to 150% row profile").toBe(at150.rowSig);
  });

  // Would catch: bitmaps leaking (every visited page kept alive => an 80-page
  // document blows out memory) or a visible page being freed under the user.
  // The scroll here deliberately straddles the 3/4 boundary.
  //
  // Today only the two pages sharing the viewport are live: PageView's
  // near-viewport observer asks for `rootMargin: "800px"` but leaves the root
  // as the document viewport, and the Mantine ScrollArea clips the pages
  // before that margin is ever applied - so there is no prefetch. The bounds
  // below are deliberately loose enough that fixing the prefetch (root =
  // the ScrollArea viewport) keeps this test green; only a leak or an
  // over-eager free fails it.
  test("a viewport straddling two pages keeps both painted while distant pages release their bitmaps", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    // Visit several pages first so the "kept alive" failure mode is reachable.
    for (const i of [1, 2, 5, 7]) await showPage(page, i);

    await page.evaluate(() => {
      const vp = document.querySelector<HTMLElement>(
        '[data-testid="v2-stage"] .mantine-ScrollArea-viewport',
      );
      const el = document.querySelector<HTMLElement>(
        '[data-testid="v2-page-3"]',
      );
      if (!vp || !el) throw new Error("stage viewport or page 3 missing");
      const vr = vp.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      // Put page 3's bottom edge halfway down the viewport, so 3 and 4 share it.
      vp.scrollTop += er.bottom - vr.top - vr.height / 2;
    });
    // Wait for the straddling pair to paint WITHOUT scrolling again.
    await page.waitForFunction(
      () =>
        [3, 4].every((i) => {
          const c = document
            .querySelector(`[data-testid="v2-page-${i}"]`)
            ?.querySelector("canvas");
          return !!c && c.width > 0;
        }),
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(1200);

    const state = await liveBitmaps(page);
    expect(state.pageCount, "all eight page boxes must be mounted").toBe(
      TOTAL_PAGES,
    );
    expect(
      state.live,
      "both pages sharing the viewport must hold a bitmap",
    ).toEqual(expect.arrayContaining([3, 4]));
    expect(
      state.live.length,
      `live bitmaps must stay bounded, got ${JSON.stringify(state.live)}`,
    ).toBeLessThanOrEqual(4);
    expect(
      state.live,
      `live pages must be a contiguous window, got ${JSON.stringify(state.live)}`,
    ).toEqual(
      Array.from({ length: state.live.length }, (_, k) => state.live[0] + k),
    );
    expect(
      state.pixels,
      "live bitmap pixels must stay bounded (<= 4 pages)",
    ).toBeLessThanOrEqual(4 * RASTER_W * RASTER_H);

    // Both straddling pages are genuinely painted, not merely allocated.
    for (const i of [3, 4]) {
      const s = await scanPage(page, i);
      expect(s.ink, `straddling page ${i} must be painted`).toBeGreaterThan(
        800,
      );
    }
    // 0/1/6/7 are two or more page-heights away - beyond any plausible
    // prefetch margin, so they must be released whatever the policy.
    for (const i of [0, 1, 6, 7]) {
      const s = await scanPage(page, i);
      expect(s.live, `off-screen page ${i} must have released its bitmap`).toBe(
        false,
      );
      expect(
        s.placeholder,
        `off-screen page ${i} must show its placeholder`,
      ).toBe(true);
    }
  });

  // Would catch: freeing/restoring bitmaps changing the document's height or
  // nudging the scroll position, which is what makes a viewer "jump" as you
  // scroll back up through pages that were released.
  test("returning to the top restores the exact scroll height and page-0 ink position", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    const geomBefore = await page.evaluate(() => {
      const vp = document.querySelector<HTMLElement>(
        '[data-testid="v2-stage"] .mantine-ScrollArea-viewport',
      );
      if (!vp) throw new Error("stage viewport missing");
      vp.scrollTop = 0;
      return { scrollHeight: vp.scrollHeight, scrollTop: vp.scrollTop };
    });
    await page.waitForTimeout(500);
    const before = await waitForScan(
      page,
      0,
      (s) => s.ink > 800,
      "page 0 to paint at the top",
    );
    expect(
      before.clientInk,
      "page 0 must have a measurable ink box",
    ).not.toBeNull();

    for (const i of [3, 5, 7]) await showPage(page, i);

    await page.evaluate(() => {
      const vp = document.querySelector<HTMLElement>(
        '[data-testid="v2-stage"] .mantine-ScrollArea-viewport',
      );
      if (!vp) throw new Error("stage viewport missing");
      vp.scrollTop = 0;
    });
    const after = await waitForScan(
      page,
      0,
      (s) => s.ink > 800,
      "page 0 to repaint at the top",
    );

    const geomAfter = await page.evaluate(() => {
      const vp = document.querySelector<HTMLElement>(
        '[data-testid="v2-stage"] .mantine-ScrollArea-viewport',
      );
      if (!vp) throw new Error("stage viewport missing");
      return { scrollHeight: vp.scrollHeight, scrollTop: vp.scrollTop };
    });

    expect(
      geomAfter.scrollHeight,
      "document height must not change as bitmaps are freed and restored",
    ).toBe(geomBefore.scrollHeight);
    expect(geomAfter.scrollTop, "scroll position must be back at the top").toBe(
      0,
    );
    expect(after.boxTop, "page 0's box must return to the same offset").toBe(
      before.boxTop,
    );
    expect(
      after.clientInk,
      "page 0's ink must land at the same viewport coordinates",
    ).toEqual(before.clientInk);
  });

  // Would catch: the previous document's bitmap surviving a new upload (a
  // stale canvas that never re-renders), or the old page boxes not being torn
  // down when a shorter document replaces a longer one.
  test("opening a second document repaints page 0 with the new file's ink, not the old", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);
    const old = await scanPage(page, 0);
    expect(
      old.ink,
      "the first document's page 0 must be painted",
    ).toBeGreaterThan(800);
    expect([old.w, old.h], "first document raster size").toEqual([
      RASTER_W,
      RASTER_H,
    ]);
    const initial = await liveBitmaps(page);
    expect(initial.pageCount, "first document page count").toBe(TOTAL_PAGES);

    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(PARAGRAPH_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 60_000,
    });

    const fresh = await waitForScan(
      page,
      0,
      (s) => s.w !== RASTER_W && s.ink > 0,
      "page 0 to repaint from the second document",
    );

    const now = await liveBitmaps(page);
    expect(
      now.pageCount,
      "the 8-page document's extra page boxes must be torn down",
    ).toBe(1);
    await expect(page.getByTestId("v2-page-7")).toHaveCount(0);

    expect(
      [fresh.w, fresh.h],
      "the canvas must be re-rasterised at the new page size",
    ).not.toEqual([RASTER_W, RASTER_H]);
    expect(
      fresh.ink,
      "the new document's ink must replace the old bitmap's",
    ).toBeGreaterThan(old.ink * 3);
    expect(
      fresh.bands.length,
      "paragraph-sample paints a heading plus a multi-line body",
    ).toBeGreaterThan(2);
    expect(
      fresh.rowSig,
      "the row profile must differ from the previous document's",
    ).not.toBe(old.rowSig);
  });
});
