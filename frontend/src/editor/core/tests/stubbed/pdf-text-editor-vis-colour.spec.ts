import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Colour, judged on the page BITMAP rather than on the model.
//
// A run's glyphs are painted by PDFium into the page <canvas>; the contentEditable
// overlay is transparent unless it is mid-drag. So "the text turned red" is only
// true if the canvas pixels under the run turned red. Every test here samples
// ctx.getImageData() over the run's own client rect and reasons about the ink it
// finds - counts, per-row profiles, bounding boxes and channel dominance - so a
// change that reaches the store but never reaches the renderer fails.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

/** Heading run ("Heading in a bigger size") and the 4-line body paragraph. */
const HEADING = "p0-t0";
const BODY = "p0-t1";

const RED: [number, number, number] = [204, 0, 0];
const BLUE: [number, number, number] = [0, 0, 204];

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface InkSample {
  ink: number;
  area: number;
  mean: [number, number, number];
  core: [number, number, number];
  spread: number;
  bbox: Bbox | null;
  rows: number[];
  redDom: number;
  greenDom: number;
  blueDom: number;
  nearTarget: number;
  rect: { x: number; y: number; w: number; h: number };
}

interface InkOpts {
  target?: [number, number, number];
  tol?: number;
  pad?: number;
}

interface InkWindow {
  __ink: (runId: string, opts?: InkOpts) => InkSample | null;
}

// Installed before every navigation so both evaluate() and waitForFunction()
// can reach it. "Ink" is any pixel far enough from the white page; dominance
// counters classify a channel that beats the other two by a clear margin.
const INK_SAMPLER = `
window.__ink = function (runId, opts) {
  opts = opts || {};
  var el = document.querySelector('[data-testid="pdf-editor-run-' + runId + '"]');
  if (!el) return null;
  var pg = el.closest("[data-testid^='pdf-editor-page-']");
  var canvas = pg && pg.querySelector("canvas");
  if (!canvas || canvas.width < 2 || canvas.height < 2) return null;
  var ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  var cb = canvas.getBoundingClientRect();
  var rb = el.getBoundingClientRect();
  if (cb.width < 1 || rb.width < 1) return null;
  var sx = canvas.width / cb.width;
  var sy = canvas.height / cb.height;
  var pad = opts.pad === undefined ? 4 : opts.pad;
  var x0 = Math.max(0, Math.floor((rb.left - cb.left) * sx) - pad);
  var y0 = Math.max(0, Math.floor((rb.top - cb.top) * sy) - pad);
  var w = Math.min(canvas.width - x0, Math.ceil(rb.width * sx) + 2 * pad);
  var h = Math.min(canvas.height - y0, Math.ceil(rb.height * sy) + 2 * pad);
  if (w < 2 || h < 2) return null;
  var d = ctx.getImageData(x0, y0, w, h).data;
  var tgt = opts.target || null;
  var tol = opts.tol === undefined ? 12 : opts.tol;
  var ink = 0, sr = 0, sg = 0, sb = 0, sSpread = 0;
  var best = -1, core = [255, 255, 255];
  var minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  var redDom = 0, greenDom = 0, blueDom = 0, nearTarget = 0;
  var rows = new Array(h).fill(0);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      var r = d[i], g = d[i + 1], b = d[i + 2];
      var dist = 765 - (r + g + b);
      if (dist <= 90) continue;
      ink++;
      rows[y]++;
      sr += r; sg += g; sb += b;
      sSpread += Math.max(r, g, b) - Math.min(r, g, b);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (r - g > 60 && r - b > 60) redDom++;
      if (g - r > 60 && g - b > 60) greenDom++;
      if (b - r > 60 && b - g > 60) blueDom++;
      if (tgt &&
          Math.abs(r - tgt[0]) <= tol &&
          Math.abs(g - tgt[1]) <= tol &&
          Math.abs(b - tgt[2]) <= tol) nearTarget++;
      if (dist > best) { best = dist; core = [r, g, b]; }
    }
  }
  return {
    ink: ink,
    area: w * h,
    mean: ink ? [sr / ink, sg / ink, sb / ink] : [255, 255, 255],
    core: core,
    spread: ink ? sSpread / ink : 0,
    bbox: maxX < 0 ? null : { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
    rows: rows,
    redDom: redDom,
    greenDom: greenDom,
    blueDom: blueDom,
    nearTarget: nearTarget,
    rect: { x: x0, y: y0, w: w, h: h }
  };
};
`;

async function openEditor(page: import("@playwright/test").Page, file: string) {
  await page.addInitScript({ content: INK_SAMPLER });
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

async function sample(
  page: import("@playwright/test").Page,
  runId: string,
  opts: InkOpts = {},
): Promise<InkSample> {
  const s = await page.evaluate(
    ({ id, o }) => (window as unknown as InkWindow).__ink(id, o),
    { id: runId, o: opts },
  );
  expect(s, `no readable canvas ink sample for run ${runId}`).not.toBeNull();
  return s as InkSample;
}

interface InkCondition {
  target?: [number, number, number];
  tol?: number;
  minInk?: number;
  minNear?: number;
  minRedDom?: number;
  maxRedDom?: number;
  minGreenDom?: number;
  maxGreenDom?: number;
  minBlueDom?: number;
  maxSpread?: number;
}

/**
 * Poll the bitmap until it looks the way the test expects. Timeouts are
 * swallowed on purpose: the explicit expect() that follows reports the real
 * numbers instead of an opaque waitForFunction failure.
 */
async function waitForInk(
  page: import("@playwright/test").Page,
  runId: string,
  cond: InkCondition,
  timeout = 15_000,
) {
  await page
    .waitForFunction(
      ({ id, c }) => {
        const s = (window as unknown as InkWindow).__ink(id, {
          target: c.target,
          tol: c.tol,
        });
        if (!s) return false;
        if (c.minInk !== undefined && s.ink < c.minInk) return false;
        if (c.minNear !== undefined && s.nearTarget < c.minNear) return false;
        if (c.minRedDom !== undefined && s.redDom < c.minRedDom) return false;
        if (c.maxRedDom !== undefined && s.redDom > c.maxRedDom) return false;
        if (c.minGreenDom !== undefined && s.greenDom < c.minGreenDom)
          return false;
        if (c.maxGreenDom !== undefined && s.greenDom > c.maxGreenDom)
          return false;
        if (c.minBlueDom !== undefined && s.blueDom < c.minBlueDom)
          return false;
        if (c.maxSpread !== undefined && s.spread > c.maxSpread) return false;
        return true;
      },
      { id: runId, c: cond },
      { timeout, polling: 250 },
    )
    .catch(() => {});
}

/**
 * The colour picker leaves a full-screen saturation dropdown open over the
 * page, which would swallow the next click on a run.
 */
async function closePickerDropdown(page: import("@playwright/test").Page) {
  const overlay = page.locator(".mantine-ColorInput-saturationOverlay").first();
  if (!(await overlay.isVisible().catch(() => false))) return;
  await page.getByTestId("pdf-editor-colour").blur();
  await expect(
    overlay,
    "the colour dropdown should close when the picker loses focus",
  ).toBeHidden({ timeout: 5_000 });
  await page.waitForTimeout(200);
}

/** Click a run so the toolbar targets it, and confirm the toolbar woke up. */
async function selectRun(page: import("@playwright/test").Page, runId: string) {
  await closePickerDropdown(page);
  await page.locator(`[data-testid="pdf-editor-run-${runId}"]`).click();
  await page.waitForTimeout(350);
  await expect(
    page.getByTestId("pdf-editor-colour"),
    `colour picker should be enabled once ${runId} is selected`,
  ).toBeEnabled();
}

async function setFill(page: import("@playwright/test").Page, hex: string) {
  const colour = page.getByTestId("pdf-editor-colour");
  await colour.fill(hex);
  await colour.press("Enter");
}

async function openAdvanced(page: import("@playwright/test").Page) {
  await page.getByTestId("pdf-editor-colour-advanced").click();
  await expect(page.getByTestId("pdf-editor-outline-colour")).toBeVisible();
  await expect(page.getByTestId("pdf-editor-outline-width")).toBeVisible();
}

async function setOutlineColour(
  page: import("@playwright/test").Page,
  hex: string,
) {
  const oc = page.getByTestId("pdf-editor-outline-colour");
  await oc.fill(hex);
  await oc.press("Enter");
  await page.waitForTimeout(400);
}

async function setOutlineWidth(
  page: import("@playwright/test").Page,
  width: string,
) {
  const w = page.getByTestId("pdf-editor-outline-width");
  await w.fill(width);
  await w.press("Enter");
  await page.waitForTimeout(400);
}

/** Guard: the baseline really is black-ish text with plenty of ink. */
function expectBlackBaseline(s: InkSample, runId: string) {
  expect(
    s.ink,
    `${runId} baseline should have ink to recolour`,
  ).toBeGreaterThan(600);
  expect(
    s.spread,
    `${runId} baseline should be neutral grey (mean channel spread)`,
  ).toBeLessThan(6);
  expect(
    s.core[0],
    `${runId} baseline core pixel should be near black`,
  ).toBeLessThan(40);
}

test.describe("PDF text editor - colour on the page bitmap", () => {
  // Breaks if a fill change stops at the store, if the page never regenerates,
  // or if a colour-space round trip shifts the RGB the user asked for.
  test("the fill picker paints the glyph ink in the exact RGB it was handed", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    const before = await sample(page, HEADING, { target: RED });
    expectBlackBaseline(before, HEADING);
    expect(
      before.nearTarget,
      "no red ink should exist before the recolour",
    ).toBe(0);

    await selectRun(page, HEADING);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, HEADING, { target: RED, tol: 12, minNear: 260 });

    const after = await sample(page, HEADING, { target: RED, tol: 12 });
    expect(
      after.core[0],
      `core pixel red channel should be ~204, got ${after.core.join(",")}`,
    ).toBeGreaterThan(196);
    expect(
      after.core[1],
      `core green should be ~0, got ${after.core[1]}`,
    ).toBeLessThan(10);
    expect(
      after.core[2],
      `core blue should be ~0, got ${after.core[2]}`,
    ).toBeLessThan(10);
    expect(
      after.nearTarget,
      `pixels within 12 of #cc0000 (got ${after.nearTarget} of ${after.ink} ink)`, // theme-allow-color PDF ink, matched against the rendered bitmap
    ).toBeGreaterThan(200);
    expect(
      after.mean[0] - after.mean[1],
      "mean red should tower over mean green after a red recolour",
    ).toBeGreaterThan(100);
  });

  // Breaks if a recolour also re-lays out the run (re-embedded font, shifted
  // baseline, changed advance widths): the ink would move even though only the
  // colour was asked for.
  test("a recolour moves no glyph: the ink keeps its footprint and row profile", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    const before = await sample(page, BODY);
    expectBlackBaseline(before, BODY);
    expect(
      before.bbox,
      "body baseline should have an ink bounding box",
    ).not.toBeNull();

    await selectRun(page, BODY);
    await setFill(page, "#0044cc"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, BODY, { minBlueDom: 260 });

    const after = await sample(page, BODY);
    // Without this the whole test would pass vacuously if the recolour never
    // happened: unchanged ink trivially keeps its footprint.
    expect(
      after.blueDom,
      `precondition: the body ink must actually have turned blue (${after.blueDom} blue-dominant px)`,
    ).toBeGreaterThan(260);
    expect(
      before.blueDom,
      "precondition: the baseline must not already be blue",
    ).toBeLessThan(5);
    expect(
      after.bbox,
      "body should still have an ink bounding box",
    ).not.toBeNull();
    const a = before.bbox as Bbox;
    const b = after.bbox as Bbox;
    for (const [k, av, bv] of [
      ["minX", a.minX, b.minX],
      ["minY", a.minY, b.minY],
      ["maxX", a.maxX, b.maxX],
      ["maxY", a.maxY, b.maxY],
    ] as Array<[string, number, number]>) {
      expect(
        Math.abs(av - bv),
        `ink bbox ${k} moved from ${av} to ${bv}`,
      ).toBeLessThanOrEqual(2);
    }
    const ratio = after.ink / before.ink;
    expect(
      ratio,
      `ink pixel count went ${before.ink} -> ${after.ink}`,
    ).toBeGreaterThan(0.82);
    expect(
      ratio,
      `ink pixel count went ${before.ink} -> ${after.ink}`,
    ).toBeLessThan(1.2);

    const rows = Math.min(before.rows.length, after.rows.length);
    expect(rows, "row profile should span the run box").toBeGreaterThan(20);
    let diff = 0;
    let total = 0;
    for (let i = 0; i < rows; i++) {
      diff += Math.abs(before.rows[i] - after.rows[i]);
      total += before.rows[i];
    }
    expect(
      diff / Math.max(1, total),
      `row-by-row ink profile drifted (${diff} px of ${total})`,
    ).toBeLessThan(0.3);
  });

  // Breaks if SetColour leaks across runs - the classic "recoloured everything
  // on the page" regression - which a model assertion on the selected run alone
  // would never see.
  test("recolouring one run leaves a neighbour that is already a different colour alone", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    await selectRun(page, BODY);
    await setFill(page, "#0044cc"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, BODY, { minBlueDom: 260 });
    const bodyBlue = await sample(page, BODY);
    expect(
      bodyBlue.blueDom,
      "precondition: the body run must actually be blue first",
    ).toBeGreaterThan(200);

    await selectRun(page, HEADING);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, HEADING, { minRedDom: 260 });

    const heading = await sample(page, HEADING);
    const body = await sample(page, BODY);
    expect(
      heading.redDom,
      `heading should now be red (${heading.redDom} red-dominant px)`,
    ).toBeGreaterThan(200);
    expect(
      body.blueDom,
      `body should still be blue (${body.blueDom} blue-dominant px)`,
    ).toBeGreaterThan(200);
    expect(
      body.redDom,
      `body must not have picked up red ink (${body.redDom} px)`,
    ).toBeLessThan(Math.max(20, body.ink * 0.01));
    expect(
      Math.abs(body.ink - bodyBlue.ink),
      `body ink count changed ${bodyBlue.ink} -> ${body.ink} while another run was recoloured`,
    ).toBeLessThan(bodyBlue.ink * 0.15);
  });

  // Breaks if the regenerated content stream APPENDS the recoloured text over
  // the old ink instead of replacing it - the page would carry both colours.
  test("a second fill colour replaces the first, leaving no trace of the old ink", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);
    const before = await sample(page, HEADING);
    expectBlackBaseline(before, HEADING);

    await selectRun(page, HEADING);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, HEADING, { minRedDom: 260 });
    const red = await sample(page, HEADING);
    expect(
      red.redDom,
      "precondition: the first colour must land before the second",
    ).toBeGreaterThan(200);

    await setFill(page, "#0000cc"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, HEADING, {
      target: BLUE,
      tol: 12,
      minNear: 150,
      minBlueDom: 260,
    });

    const blue = await sample(page, HEADING, { target: BLUE, tol: 12 });
    expect(
      blue.blueDom,
      `heading should be blue now (${blue.blueDom} blue-dominant px)`,
    ).toBeGreaterThan(200);
    expect(
      blue.redDom,
      `no red ink should survive the second pick (${blue.redDom} of ${blue.ink} px)`,
    ).toBeLessThan(Math.max(15, blue.ink * 0.02));
    expect(
      blue.ink / red.ink,
      `ink count ${red.ink} -> ${blue.ink}: a stacked repaint would grow it`,
    ).toBeLessThan(1.2);
    expect(
      blue.core[2],
      `core pixel blue channel should be ~204, got ${blue.core.join(",")}`,
    ).toBeGreaterThan(196);
  });

  // Breaks if undo restores the model fill but never repaints the page, or if
  // it stamps a representative colour over the run instead of each member's
  // own previous fill.
  test("undo repaints the original ink, not just the model fill", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);
    const before = await sample(page, HEADING);
    expectBlackBaseline(before, HEADING);

    await selectRun(page, HEADING);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, HEADING, { minRedDom: 260 });
    const red = await sample(page, HEADING);
    expect(
      red.redDom,
      "precondition: the recolour must land first",
    ).toBeGreaterThan(200);

    const undo = page.getByTestId("pdf-editor-undo");
    await expect(undo, "undo should be armed by the recolour").toBeEnabled();
    await undo.click();
    // The poll bound is strictly TIGHTER than the assertion below, so a
    // satisfied wait can never be followed by a failing expect.
    const greyBound = Math.max(4, before.spread + 1);
    await waitForInk(
      page,
      HEADING,
      { maxRedDom: 15, maxSpread: greyBound },
      20_000,
    );

    const back = await sample(page, HEADING);
    expect(
      back.redDom,
      `red ink should be gone after undo (${back.redDom} px left, was ${red.redDom})`,
    ).toBeLessThan(20);
    expect(
      back.spread,
      `ink should be neutral grey again: baseline spread ${before.spread.toFixed(1)}, got ${back.spread.toFixed(1)}`,
    ).toBeLessThan(greyBound + 1);
    expect(
      back.core[0],
      `core pixel should be black again, got ${back.core.join(",")}`,
    ).toBeLessThan(40);
    expect(
      Math.abs(back.ink - before.ink),
      `ink count should return to the baseline ${before.ink}, got ${back.ink}`,
    ).toBeLessThan(before.ink * 0.15);
  });

  // Breaks if the fill only ever lived on the focused overlay (CSS colour) and
  // the canvas never got it - blurring would drop the colour on the floor.
  test("the new fill outlives the blur to another run and is canvas ink, not overlay text", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);
    const before = await sample(page, HEADING, { target: RED });
    expectBlackBaseline(before, HEADING);

    await selectRun(page, HEADING);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, HEADING, { target: RED, tol: 12, minNear: 200 });

    // Blur: focus moves to the other run entirely.
    await selectRun(page, BODY);
    await page.waitForTimeout(1200);
    await waitForInk(page, HEADING, {
      target: RED,
      tol: 12,
      minNear: 260,
      minRedDom: 260,
    });

    const overlay = await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      );
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { color: cs.color, focused: document.activeElement === el };
    }, HEADING);
    expect(overlay, "heading overlay should still exist").not.toBeNull();
    expect(
      overlay!.focused,
      "heading must not be the focused element any more",
    ).toBe(false);
    expect(
      overlay!.color.replace(/\s/g, ""),
      "an unfocused overlay paints no glyphs, so the red we sample is canvas ink",
    ).toBe("rgba(0,0,0,0)");

    const after = await sample(page, HEADING, { target: RED, tol: 12 });
    expect(
      after.nearTarget,
      `red ink should survive the blur (${after.nearTarget} px within 12 of #cc0000)`, // theme-allow-color PDF ink, matched against the rendered bitmap
    ).toBeGreaterThan(200);
    expect(
      after.redDom,
      `heading should still read red (${after.redDom} red-dominant px)`,
    ).toBeGreaterThan(200);
  });

  // Breaks if the outline reaches the model but not the page objects - render
  // mode never moved to fill-and-stroke, or the stroke colour was never written.
  test("the advanced popover's outline paints stroke-coloured pixels the fill alone never had", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);
    const before = await sample(page, HEADING);
    expectBlackBaseline(before, HEADING);
    expect(
      before.greenDom,
      "no green ink should exist before the outline is applied",
    ).toBeLessThan(5);

    await selectRun(page, HEADING);
    await openAdvanced(page);
    await setOutlineColour(page, "#00aa00"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await setOutlineWidth(page, "1.5");
    await waitForInk(page, HEADING, { minGreenDom: 400 });

    const after = await sample(page, HEADING);
    expect(
      after.greenDom,
      `outlined glyphs should show green stroke pixels (${after.greenDom} px)`,
    ).toBeGreaterThan(300);
    expect(
      after.ink / before.ink,
      `a 1.5pt stroke should thicken the ink (${before.ink} -> ${after.ink})`,
    ).toBeGreaterThan(1.2);
    expect(
      after.mean[1] - after.mean[0],
      "mean green should beat mean red once the glyphs are outlined green",
    ).toBeGreaterThan(60);
  });

  // Breaks if the stroke width is stored but ignored by the writer - every
  // width would then render the same weight of outline.
  test("a wider outline lays down strictly more ink than a narrow one", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);
    const plain = await sample(page, HEADING);
    expectBlackBaseline(plain, HEADING);

    await selectRun(page, HEADING);
    await openAdvanced(page);
    await setOutlineColour(page, "#00aa00"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await setOutlineWidth(page, "0.5");
    await waitForInk(page, HEADING, { minGreenDom: 150 });
    const narrow = await sample(page, HEADING);
    expect(
      narrow.greenDom,
      "precondition: the narrow outline must render at all",
    ).toBeGreaterThan(100);
    expect(
      narrow.ink,
      `a 0.5pt outline should already add ink over the plain ${plain.ink}`,
    ).toBeGreaterThan(plain.ink);

    await setOutlineWidth(page, "2.5");
    await waitForInk(page, HEADING, {
      minInk: Math.ceil(narrow.ink * 1.3),
      minGreenDom: narrow.greenDom + 1,
    });

    const wide = await sample(page, HEADING);
    expect(
      wide.ink / narrow.ink,
      `2.5pt should out-ink 0.5pt (${narrow.ink} -> ${wide.ink})`,
    ).toBeGreaterThan(1.25);
    expect(
      wide.greenDom,
      `the wider stroke should also carry more green (${narrow.greenDom} -> ${wide.greenDom})`,
    ).toBeGreaterThan(narrow.greenDom);
  });

  // Breaks if clearing the width leaves the stroke colour or the fill-and-stroke
  // render mode behind: the glyphs would stay fat and green.
  test("dropping the outline width to zero strips the stroke pixels back off the page", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);
    const plain = await sample(page, HEADING);
    expectBlackBaseline(plain, HEADING);

    await selectRun(page, HEADING);
    await openAdvanced(page);
    await setOutlineColour(page, "#00aa00"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await setOutlineWidth(page, "1.5");
    await waitForInk(page, HEADING, { minGreenDom: 400 });
    const outlined = await sample(page, HEADING);
    expect(
      outlined.greenDom,
      "precondition: the outline must be visible before clearing it",
    ).toBeGreaterThan(300);

    await setOutlineWidth(page, "0");
    // Tighter than the assertions below for the same reason as the undo test.
    const greyBound = Math.max(4, plain.spread + 1);
    await waitForInk(
      page,
      HEADING,
      { maxGreenDom: 15, maxSpread: greyBound },
      20_000,
    );

    const cleared = await sample(page, HEADING);
    expect(
      cleared.greenDom,
      `green stroke pixels should be gone (${outlined.greenDom} -> ${cleared.greenDom})`,
    ).toBeLessThan(Math.max(20, outlined.greenDom * 0.05));
    expect(
      Math.abs(cleared.ink - plain.ink),
      `ink should return to the unstroked baseline ${plain.ink}, got ${cleared.ink}`,
    ).toBeLessThan(plain.ink * 0.2);
    expect(
      cleared.spread,
      `ink should be neutral again: baseline spread ${plain.spread.toFixed(1)}, got ${cleared.spread.toFixed(1)}`,
    ).toBeLessThan(greyBound + 1);
  });

  // Breaks if the picker's alpha channel is allowed through: #cc000080 would
  // render half-blended into the white page, so no pixel would ever reach the
  // solid #cc0000 the control run reaches.
  test("an alpha suffix in the picker leaves the ink as opaque as a plain hex", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);
    expectBlackBaseline(await sample(page, HEADING), HEADING);
    expectBlackBaseline(await sample(page, BODY), BODY);

    // Control: a plain 6-digit hex on the body paragraph.
    await selectRun(page, BODY);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, BODY, { target: RED, tol: 12, minNear: 260 });
    const control = await sample(page, BODY, { target: RED, tol: 12 });

    // Same colour, but with a half-transparent alpha suffix.
    await selectRun(page, HEADING);
    await setFill(page, "#cc000080"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await waitForInk(page, HEADING, { target: RED, tol: 12, minNear: 200 });
    const alpha = await sample(page, HEADING, { target: RED, tol: 12 });

    for (let c = 0; c < 3; c++) {
      expect(
        Math.abs(alpha.core[c] - control.core[c]),
        `channel ${c}: alpha-suffixed core ${alpha.core.join(",")} vs control ${control.core.join(",")}`,
      ).toBeLessThanOrEqual(5);
    }
    expect(
      alpha.core[0],
      `alpha-suffixed ink must reach solid 204 red, got ${alpha.core.join(",")}`,
    ).toBeGreaterThan(196);
    expect(
      alpha.nearTarget,
      `solid #cc0000 pixels under the alpha-suffixed run (${alpha.nearTarget} of ${alpha.ink})`, // theme-allow-color PDF ink, matched against the rendered bitmap
    ).toBeGreaterThan(150);
    expect(
      alpha.nearTarget / alpha.ink,
      "a half-alpha fill would blend every pixel toward white, leaving no solid core",
    ).toBeGreaterThan(0.05);
  });
});
