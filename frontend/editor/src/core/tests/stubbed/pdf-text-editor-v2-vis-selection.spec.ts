import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Visual validation of the v2 editor's SELECTION AFFORDANCES.
//
// Every affordance here is painted by the run overlay (or the marquee div) on
// top of the PDFium bitmap, so none of it is visible in the model. These tests
// therefore read real pixels: the page <canvas> for where the glyph ink is,
// and clipped page screenshots for what the affordance actually painted.
//
// Measured deltas over a white page (blue-minus-red per pixel), which is what
// every threshold below is derived from:
//   nothing              b-r = 0
//   hover background     rgba(44,123,229,0.04) -> b-r = 7
//   selection background rgba(44,123,229,0.10) -> b-r = 19
//   marquee background   rgba(44,123,229,0.08) -> b-r = 15
//   dashed border pixels rgba(44,123,229,0.5)  -> b-r = 93
// The shift is 0.1*(229-44) regardless of the underlying grey, so an inked
// pixel picks up exactly the same delta as the white paper next to it.

const MUSHROOM = path.join(
  import.meta.dirname,
  "../test-fixtures/mushroom-life.pdf",
);

type P = import("@playwright/test").Page;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A pixel counts as tinted at/above this blue-minus-red delta. */
const TINT_MIN = 12;
/** A pixel counts as part of a dashed border at/above this delta. */
const STRONG_MIN = 60;

interface V2Win {
  __v2_editor_store: {
    selection: {
      value: { runIds: string[] };
      clear(): void;
      selectMany(ids: string[]): void;
    };
  };
}

async function openV2(page: P, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

interface InkBox {
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface RunGeom {
  id: string;
  rect: Rect;
  ink: InkBox;
}

/**
 * Every page-0 run, with the extent of the GLYPH INK the page bitmap actually
 * painted under it (searched in the run's own box grown by `pad`, so it is the
 * bitmap - not the overlay - that decides where the text is).
 */
function runGeometry(page: P, padPx = 4): Promise<RunGeom[]> {
  return page.evaluate((grow: number) => {
    const pageEl = document.querySelector(
      '[data-testid="v2-page-0"]',
    ) as HTMLElement;
    const canvas = pageEl.querySelector("canvas") as HTMLCanvasElement;
    const cb = canvas.getBoundingClientRect();
    const sx = canvas.width / cb.width;
    const sy = canvas.height / cb.height;
    const ctx = canvas.getContext("2d")!;
    const full = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const out: RunGeomWire[] = [];
    const els = document.querySelectorAll<HTMLElement>(
      '[data-testid^="v2-run-p0-"]',
    );
    for (const el of els) {
      const b = el.getBoundingClientRect();
      let count = 0;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (
        let y = Math.floor(b.top - grow);
        y < Math.ceil(b.bottom + grow);
        y++
      ) {
        const cy = Math.round((y - cb.top) * sy);
        if (cy < 0 || cy >= canvas.height) continue;
        for (
          let x = Math.floor(b.left - grow);
          x < Math.ceil(b.right + grow);
          x++
        ) {
          const cx = Math.round((x - cb.left) * sx);
          if (cx < 0 || cx >= canvas.width) continue;
          const i = (cy * canvas.width + cx) * 4;
          if (full[i] < 160 && full[i + 1] < 160) {
            count++;
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
      }
      out.push({
        id: el.dataset.testid!.replace("v2-run-", ""),
        rect: { x: b.x, y: b.y, width: b.width, height: b.height },
        ink: { count, x0, y0, x1, y1 },
      });
    }
    return out;
  }, padPx);
}

interface RunGeomWire {
  id: string;
  rect: Rect;
  ink: InkBox;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Analysis {
  /** Screenshot size in CSS px (device scale factor is 1 in this project). */
  w: number;
  h: number;
  /** Pixels of the CLIP that the page bitmap painted dark (the glyph ink). */
  ink: number;
  /** How many of those ink pixels read as tinted in the screenshot. */
  inkTinted: number;
  /** Bounding box of the ink as seen IN THE SHOT (same frame as tintBox). */
  inkBox: Box;
  /** Bounding box of the tinted pixels, in shot-derived client coordinates. */
  tintBox: Box;
  tinted: number;
  strong: number;
  meanBR: number;
}

/**
 * Screenshot `clip`, then line the shot up against the page bitmap underneath
 * it: which pixels the PDF inked, and which of those the overlay tinted.
 */
async function analyse(page: P, clip: Rect): Promise<Analysis> {
  const buf = await page.screenshot({ clip });
  return page.evaluate(
    async (arg: {
      b64: string;
      clip: Rect;
      tintMin: number;
      strongMin: number;
    }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + arg.b64;
      await img.decode();
      const shot = document.createElement("canvas");
      shot.width = img.naturalWidth;
      shot.height = img.naturalHeight;
      const sctx = shot.getContext("2d")!;
      sctx.drawImage(img, 0, 0);
      const S = sctx.getImageData(0, 0, shot.width, shot.height).data;

      const pageEl = document.querySelector(
        '[data-testid="v2-page-0"]',
      ) as HTMLElement;
      const canvas = pageEl.querySelector("canvas") as HTMLCanvasElement;
      const cb = canvas.getBoundingClientRect();
      // A clip that runs off the bitmap would silently compare against
      // nothing, so refuse it rather than return a vacuous zero.
      if (
        arg.clip.x < cb.left ||
        arg.clip.y < cb.top ||
        arg.clip.x + arg.clip.width > cb.right ||
        arg.clip.y + arg.clip.height > cb.bottom
      ) {
        throw new Error("clip is not fully inside the page bitmap");
      }
      const sx = canvas.width / cb.width;
      const sy = canvas.height / cb.height;
      const cctx = canvas.getContext("2d")!;
      const C = cctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let ink = 0;
      let inkTinted = 0;
      let tinted = 0;
      let strong = 0;
      let sumBR = 0;
      const inkBox = {
        x0: Infinity,
        y0: Infinity,
        x1: -Infinity,
        y1: -Infinity,
      };
      const tintBox = {
        x0: Infinity,
        y0: Infinity,
        x1: -Infinity,
        y1: -Infinity,
      };
      for (let py = 0; py < shot.height; py++) {
        const clientY = arg.clip.y + py;
        const cy = Math.round((clientY - cb.top) * sy);
        for (let px = 0; px < shot.width; px++) {
          const clientX = arg.clip.x + px;
          const si = (py * shot.width + px) * 4;
          const br = S[si + 2] - S[si];
          sumBR += br;
          const isTint = br >= arg.tintMin;
          if (isTint) {
            tinted++;
            if (clientX < tintBox.x0) tintBox.x0 = clientX;
            if (clientY < tintBox.y0) tintBox.y0 = clientY;
            if (clientX > tintBox.x1) tintBox.x1 = clientX;
            if (clientY > tintBox.y1) tintBox.y1 = clientY;
          }
          if (br >= arg.strongMin) strong++;
          // Glyph ink located IN THE SHOT, same frame as the tint: WebKit's
          // clipped screenshots land ~15px off the client coordinates, so a
          // canvas-derived box would be comparing across two coordinate
          // frames. Dark but not ring-blue (a tinted black glyph reads
          // br~18, ring pixels ~93).
          if (S[si] < 160 && S[si + 1] < 160 && br < arg.strongMin) {
            if (clientX < inkBox.x0) inkBox.x0 = clientX;
            if (clientY < inkBox.y0) inkBox.y0 = clientY;
            if (clientX > inkBox.x1) inkBox.x1 = clientX;
            if (clientY > inkBox.y1) inkBox.y1 = clientY;
          }
          const cx = Math.round((clientX - cb.left) * sx);
          if (cx < 0 || cx >= canvas.width || cy < 0 || cy >= canvas.height)
            continue;
          const ci = (cy * canvas.width + cx) * 4;
          if (C[ci] < 160 && C[ci + 1] < 160) {
            ink++;
            if (isTint) inkTinted++;
          }
        }
      }
      return {
        w: shot.width,
        h: shot.height,
        ink,
        inkTinted,
        inkBox,
        tintBox,
        tinted,
        strong,
        meanBR: sumBR / (shot.width * shot.height),
      };
    },
    {
      b64: buf.toString("base64"),
      clip,
      tintMin: TINT_MIN,
      strongMin: STRONG_MIN,
    },
  );
}

function selectedIds(page: P): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as V2Win).__v2_editor_store.selection.value.runIds,
  );
}

/** Ctrl+Shift+drag with the real mouse. `release: false` leaves it held. */
async function marquee(
  page: P,
  from: { x: number; y: number },
  to: { x: number; y: number },
  release = true,
) {
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  if (release) {
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await page.waitForTimeout(250);
  }
}

async function canvasRect(page: P): Promise<Rect> {
  return page.evaluate(() => {
    const c = document
      .querySelector('[data-testid="v2-page-0"]')!
      .querySelector("canvas") as HTMLCanvasElement;
    const b = c.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
}

/** Runs whose box is fully inside the viewport, so they can be screenshotted. */
function onScreen(runs: RunGeom[]): RunGeom[] {
  return runs.filter(
    (r) => r.rect.y >= 120 && r.rect.y + r.rect.height <= 1050,
  );
}

function pad(rect: Rect, p: number): Rect {
  return {
    x: rect.x - p,
    y: rect.y - p,
    width: rect.width + 2 * p,
    height: rect.height + 2 * p,
  };
}

test.describe("v2 editor - selection affordances, visually", () => {
  test.setTimeout(120_000);

  // Breaks if the marquee div stops rendering, renders behind the page, or
  // renders with no size/colour: the store would still select, but the user
  // would be dragging an invisible rectangle.
  test("Ctrl+Shift drag paints a dashed blue band while the pointer is still down", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const cv = await canvasRect(page);
    // A strip of blank left margin, inside the band but clear of every run.
    const probe: Rect = { x: cv.x + 8, y: 320, width: 80, height: 100 };

    const before = await analyse(page, probe);
    expect(
      before.tinted,
      "blank margin must start with no blue pixels at all",
    ).toBe(0);

    const top = 300;
    await marquee(
      page,
      { x: cv.x + 3, y: top },
      { x: cv.x + cv.width - 3, y: 700 },
      false,
    );
    await page.waitForTimeout(150);

    const band = page.getByTestId("v2-marquee");
    await expect(band).toBeVisible();
    const border = await band.evaluate(
      (el) => getComputedStyle(el).borderTopStyle,
    );
    expect(border, "marquee is drawn as a dashed rectangle").toBe("dashed");

    const during = await analyse(page, probe);
    // The whole probe strip is inside the band, so every pixel of it must
    // have picked up the 8% wash.
    expect(
      during.tinted,
      `every pixel of the probe strip should be washed blue (got ${during.tinted}/${during.w * during.h})`,
    ).toBe(during.w * during.h);
    expect(during.meanBR).toBeGreaterThan(10);

    // ... and the band's top edge must be a real dashed line of border pixels.
    const edge = await analyse(page, {
      x: cv.x + 8,
      y: top - 3,
      width: 120,
      height: 6,
    });
    expect(
      edge.strong,
      "the band's top edge should paint solid-blue dash pixels",
    ).toBeGreaterThan(10);

    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
  });

  // Breaks if collectRunsInRect works in the wrong coordinate space (page vs
  // client), or intersects against the wrong box: runs whose glyphs are
  // nowhere near the drag would come back selected.
  test("the marquee selects exactly the runs whose glyph ink it encloses", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const cv = await canvasRect(page);
    const runs = await runGeometry(page);
    expect(
      runs.length,
      "fixture must give several runs to discriminate between",
    ).toBeGreaterThanOrEqual(5);
    for (const r of runs) {
      expect(r.ink.count, `run ${r.id} must sit over real ink`).toBeGreaterThan(
        20,
      );
    }

    const band = { top: 270, bottom: 700 };
    await marquee(
      page,
      { x: cv.x + 3, y: band.top },
      { x: cv.x + cv.width - 3, y: band.bottom },
    );

    const sel = new Set(await selectedIds(page));
    expect(sel.size, "marquee must select something").toBeGreaterThan(1);
    expect(
      sel.size,
      "marquee must not select the whole page - it only covered part of it",
    ).toBeLessThan(runs.length);

    let inBand = 0;
    let outOfBand = 0;
    for (const r of runs) {
      const insideBand = r.ink.y0 >= band.top && r.ink.y1 <= band.bottom;
      const clearOfBand = r.ink.y1 < band.top || r.ink.y0 > band.bottom;
      if (insideBand) {
        inBand++;
        expect(
          sel.has(r.id),
          `run ${r.id} has all its ink (y ${r.ink.y0}-${r.ink.y1}) inside the drag, so it must be selected`,
        ).toBe(true);
      } else if (clearOfBand) {
        outOfBand++;
        expect(
          sel.has(r.id),
          `run ${r.id} has no ink (y ${r.ink.y0}-${r.ink.y1}) in the drag, so it must not be selected`,
        ).toBe(false);
      }
    }
    // Neither branch may be empty, or the loop above proved nothing.
    expect(inBand, "runs fully inside the drag were checked").toBeGreaterThan(
      1,
    );
    expect(
      outOfBand,
      "runs fully outside the drag were checked",
    ).toBeGreaterThan(1);
  });

  // Breaks if the tint is painted at an offset from the run it belongs to, or
  // is applied to every run rather than the selected ones.
  test("the marquee's tint lands on the caught runs' glyphs and on no others", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const cv = await canvasRect(page);
    const runs = onScreen(await runGeometry(page));
    expect(runs.length).toBeGreaterThanOrEqual(4);

    await marquee(
      page,
      { x: cv.x + 3, y: 270 },
      { x: cv.x + cv.width - 3, y: 700 },
    );
    // Park the pointer off the page so no hover wash muddies the readings.
    await page.mouse.move(20, 20);
    await page.waitForTimeout(200);
    const sel = new Set(await selectedIds(page));
    expect(sel.size).toBeGreaterThan(1);

    let checkedIn = 0;
    let checkedOut = 0;
    for (const r of runs) {
      const a = await analyse(page, pad(r.rect, 3));
      expect(a.ink, `run ${r.id} needs ink to judge`).toBeGreaterThan(20);
      if (sel.has(r.id)) {
        checkedIn++;
        expect(
          a.inkTinted / a.ink,
          `selected run ${r.id}: ${a.inkTinted}/${a.ink} of its ink pixels are tinted`,
        ).toBeGreaterThan(0.97);
      } else {
        checkedOut++;
        expect(
          a.inkTinted,
          `unselected run ${r.id} must have no tinted ink (${a.inkTinted}/${a.ink})`,
        ).toBe(0);
      }
    }
    expect(checkedIn, "at least one selected run was measured").toBeGreaterThan(
      0,
    );
    expect(
      checkedOut,
      "at least one unselected run was measured",
    ).toBeGreaterThan(0);
  });

  // Breaks if the marquee div is left mounted after pointerup (a fixed-position
  // wash stuck over the document) - the selection would be right but the page
  // would stay blue.
  test("the marquee band leaves no wash behind once the pointer is released", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const cv = await canvasRect(page);
    const probe: Rect = { x: cv.x + 8, y: 320, width: 80, height: 100 };
    const before = await analyse(page, probe);
    expect(before.tinted, "baseline margin is untinted").toBe(0);

    await marquee(
      page,
      { x: cv.x + 3, y: 300 },
      { x: cv.x + cv.width - 3, y: 700 },
    );
    await page.mouse.move(20, 20);
    await page.waitForTimeout(250);

    await expect(page.getByTestId("v2-marquee")).toHaveCount(0);
    const after = await analyse(page, probe);
    expect(
      after.tinted,
      "blank margin inside the released band must be clean again",
    ).toBe(0);
    expect(after.meanBR, "and colour-identical to before the drag").toBeCloseTo(
      before.meanBR,
      1,
    );
    // The selection it produced is still live, so this is not a "nothing
    // happened" pass.
    expect((await selectedIds(page)).length).toBeGreaterThan(1);
  });

  // Breaks if select-all reaches the store but some overlays never re-render
  // with selected=true - the user presses Ctrl+A and only part of the page
  // lights up.
  test("select-all puts a visible tint over every glyph on the page", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const runs = onScreen(await runGeometry(page));
    expect(
      runs.length,
      "need several on-screen runs for this to mean anything",
    ).toBeGreaterThanOrEqual(4);

    await page.keyboard.press("Control+a");
    await page.mouse.move(20, 20);
    await page.waitForTimeout(400);

    const sel = new Set(await selectedIds(page));
    for (const r of runs) {
      expect(sel.has(r.id), `select-all must include ${r.id}`).toBe(true);
      const a = await analyse(page, pad(r.rect, 3));
      expect(a.ink).toBeGreaterThan(20);
      expect(
        a.inkTinted / a.ink,
        `run ${r.id}: only ${a.inkTinted}/${a.ink} ink pixels are under the tint`,
      ).toBeGreaterThan(0.97);
    }
  });

  // Breaks if a deselected overlay keeps its background - the classic
  // "selection sticks" regression, invisible to any store-level assertion.
  test("clicking empty page space repaints the tinted run its original colour", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const cv = await canvasRect(page);
    const runs = onScreen(await runGeometry(page));
    const target = runs[0];
    const clip = pad(target.rect, 4);

    await page.mouse.move(20, 20);
    const baseline = await analyse(page, clip);
    expect(baseline.ink).toBeGreaterThan(50);
    expect(baseline.tinted, "run starts untinted").toBe(0);

    // Shift-click selects without focusing, so no caret is blinking in the
    // pixels we are about to compare.
    await page.keyboard.down("Shift");
    await page.mouse.click(
      target.rect.x + target.rect.width / 2,
      target.rect.y + target.rect.height / 2,
    );
    await page.keyboard.up("Shift");
    await page.mouse.move(20, 20);
    await page.waitForTimeout(250);
    const selected = await analyse(page, clip);
    expect(selected.inkTinted / selected.ink).toBeGreaterThan(0.97);

    // Click blank margin: the stage clears the selection.
    await page.mouse.click(cv.x + 20, cv.y + 40);
    await page.mouse.move(20, 20);
    await page.waitForTimeout(300);
    expect((await selectedIds(page)).length).toBe(0);

    const cleared = await analyse(page, clip);
    expect(cleared.tinted, "no blue pixel may survive the clear").toBe(0);
    expect(cleared.ink, "and the glyphs are still all there afterwards").toBe(
      baseline.ink,
    );
    expect(cleared.meanBR).toBeCloseTo(baseline.meanBR, 2);
  });

  // Breaks if the overlay box drifts off its glyphs (wrong DisplayTransform,
  // stale bounds): the run would still be selectable, but the highlight would
  // sit beside the text it claims to have selected.
  test("the selection tint brackets the run's ink instead of sitting beside it", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const runs = onScreen(await runGeometry(page));
    const target = runs[0];
    const clip = pad(target.rect, 14);

    await page.keyboard.down("Shift");
    await page.mouse.click(
      target.rect.x + target.rect.width / 2,
      target.rect.y + target.rect.height / 2,
    );
    await page.keyboard.up("Shift");
    await page.mouse.move(20, 20);
    await page.waitForTimeout(250);
    expect(await selectedIds(page)).toEqual([target.id]);

    const a = await analyse(page, clip);
    expect(a.ink, "ink is needed to bracket").toBeGreaterThan(50);
    expect(a.tinted).toBeGreaterThan(a.ink);
    // Containment: the tint must start left of / above the first inked pixel
    // and end right of / below the last one.
    expect(
      a.tintBox.x0,
      `tint left ${a.tintBox.x0} must not start right of ink left ${a.inkBox.x0}`,
    ).toBeLessThanOrEqual(a.inkBox.x0);
    expect(a.tintBox.x1).toBeGreaterThanOrEqual(a.inkBox.x1);
    expect(a.tintBox.y0).toBeLessThanOrEqual(a.inkBox.y0);
    expect(a.tintBox.y1).toBeGreaterThanOrEqual(a.inkBox.y1);
    // ... and it must hug it: an overlay that had slipped a line would still
    // "contain" the ink if it were huge, so cap the slack too. The box owns
    // ~a font-size of deliberate caret room, so the cap sits above that but
    // far below the box-doubling drift this exists to catch.
    const inkW = a.inkBox.x1 - a.inkBox.x0;
    const tintW = a.tintBox.x1 - a.tintBox.x0;
    expect(
      tintW - inkW,
      `tint is ${tintW}px wide for ${inkW}px of ink - too much slack`,
    ).toBeLessThan(48);
  });

  // Breaks if the hover affordance stops rendering, or if the selected state
  // starts stacking a dashed ring on top of its tint (double affordance).
  test("hover rings an unselected run, and selecting it swaps the ring for a tint", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const runs = onScreen(await runGeometry(page));
    const target = runs[1] ?? runs[0];
    const clip = pad(target.rect, 6);
    const centre = {
      x: target.rect.x + target.rect.width / 2,
      y: target.rect.y + target.rect.height / 2,
    };

    await page.mouse.move(20, 20);
    const idle = await analyse(page, clip);
    expect(idle.strong, "idle run draws no ring").toBe(0);

    await page.mouse.move(centre.x, centre.y);
    await page.waitForTimeout(250);
    const hovered = await analyse(page, clip);
    expect(
      hovered.strong,
      "hover must paint dashed border pixels",
    ).toBeGreaterThan(40);
    // The ring goes AROUND the ink, not through it.
    expect(hovered.tintBox.x0).toBeLessThanOrEqual(hovered.inkBox.x0);
    expect(hovered.tintBox.x1).toBeGreaterThanOrEqual(hovered.inkBox.x1);
    expect(hovered.tintBox.y0).toBeLessThanOrEqual(hovered.inkBox.y0);
    expect(hovered.tintBox.y1).toBeGreaterThanOrEqual(hovered.inkBox.y1);

    // Now select it. A selected run keeps a ring AND gains the tint.
    //
    // This used to assert the ring disappeared on selection. That was the
    // behaviour, and it was the defect: selecting a run deleted the only crisp
    // edge it had and left a 10% wash as the sole cue, which is close to
    // shapeless over a coloured page. Selection now draws a solid ring.
    await page.keyboard.down("Shift");
    await page.mouse.click(centre.x, centre.y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(250);
    expect(await selectedIds(page)).toEqual([target.id]);
    const sel = await analyse(page, clip);
    expect(
      sel.strong,
      "a selected run must still be ringed, not just washed",
    ).toBeGreaterThan(40);
    expect(
      sel.inkTinted / sel.ink,
      "and it must wear the selection tint",
    ).toBeGreaterThan(0.97);
  });

  // Breaks on a stuck hover (mouseleave never wired / React state kept): the
  // page would slowly fill with dashed rings as the pointer travels over it.
  test("the hover ring is gone once the pointer leaves the run", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const runs = onScreen(await runGeometry(page));
    const target = runs[1] ?? runs[0];
    const clip = pad(target.rect, 6);

    await page.mouse.move(
      target.rect.x + target.rect.width / 2,
      target.rect.y + target.rect.height / 2,
    );
    await page.waitForTimeout(250);
    const on = await analyse(page, clip);
    expect(on.strong, "precondition: the ring is showing").toBeGreaterThan(40);
    expect(on.ink).toBeGreaterThan(20);

    // Off the run but still over the page, so this is a real pointer-out and
    // not a "the whole editor unmounted" pass.
    await page.mouse.move(target.rect.x + target.rect.width / 2, 130);
    await page.waitForTimeout(300);
    const off = await analyse(page, clip);
    expect(off.strong, "ring must be gone").toBe(0);
    expect(off.tinted, "and no wash left behind").toBe(0);
    expect(off.ink, "the glyphs are untouched by hovering").toBe(on.ink);
  });

  // Breaks if lock stops making a run inert (it would light up blue on click)
  // or if locking hides/repaints the glyphs. NOTE: locking gives a run no
  // appearance of its own - the only cue is the title tooltip - so what is
  // asserted here is the absence of the selection affordance.
  test("a locked run refuses the selection tint and keeps its glyphs", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM);
    const runs = onScreen(await runGeometry(page));
    const target = runs[1] ?? runs[0];
    const clip = pad(target.rect, 6);
    const centre = {
      x: target.rect.x + target.rect.width / 2,
      y: target.rect.y + target.rect.height / 2,
    };

    await page.mouse.move(20, 20);
    const before = await analyse(page, clip);
    expect(before.ink).toBeGreaterThan(20);
    expect(before.tinted).toBe(0);

    await page.keyboard.down("Shift");
    await page.mouse.click(centre.x, centre.y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(200);
    await page.getByTestId("v2-toggle-lock").click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId(`v2-run-${target.id}`)).toHaveAttribute(
      "data-locked",
      "true",
    );

    await page.evaluate(() =>
      (window as unknown as V2Win).__v2_editor_store.selection.clear(),
    );
    await page.mouse.move(20, 20);
    await page.waitForTimeout(200);

    // A plain click on the locked run must not select it...
    await page.mouse.click(centre.x, centre.y);
    await page.waitForTimeout(300);
    expect(
      (await selectedIds(page)).length,
      "a locked run must stay unselected when clicked",
    ).toBe(0);

    await page.mouse.move(20, 20);
    await page.waitForTimeout(250);
    const after = await analyse(page, clip);
    expect(after.tinted, "... so no selection tint may appear over it").toBe(0);
    expect(after.ink, "and locking must not repaint or hide the text").toBe(
      before.ink,
    );
  });
});
