import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// The fill colour picker (ColorInput, testid pdf-editor-colour) had three faults that
// all trace back to Mantine driving onChange from its own dropdown lifecycle:
//
//  (A) `fixOnBlur` re-emitted the last valid colour when the input blurred, so
//      clicking Undo re-dispatched SetColour after the undo landed and the text
//      stayed recoloured (past the 600ms coalesce window).
//  (B) that same re-emission made one committed pick cost two Ctrl+Z.
//  (C) the saturation dropdown stayed portalled over the page, swallowing the
//      next click on a run, and Escape did not dismiss it.
//
// Judged on the page bitmap, the history depth and hit-testing - not on the
// toolbar's own state.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

/** Heading run, and the 4-line body paragraph below it. */
const HEADING = "p0-t0";
const BODY = "p0-t1";

interface InkSample {
  ink: number;
  redDom: number;
  core: [number, number, number];
}

interface InkWindow {
  __ink: (runId: string) => InkSample | null;
}

// Counts the pixels under a run's client rect that are clearly red-dominant.
const INK_SAMPLER = `
window.__ink = function (runId) {
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
  var x0 = Math.max(0, Math.floor((rb.left - cb.left) * sx) - 4);
  var y0 = Math.max(0, Math.floor((rb.top - cb.top) * sy) - 4);
  var w = Math.min(canvas.width - x0, Math.ceil(rb.width * sx) + 8);
  var h = Math.min(canvas.height - y0, Math.ceil(rb.height * sy) + 8);
  if (w < 2 || h < 2) return null;
  var d = ctx.getImageData(x0, y0, w, h).data;
  var ink = 0, redDom = 0, best = -1, core = [255, 255, 255];
  for (var i = 0; i < d.length; i += 4) {
    var r = d[i], g = d[i + 1], b = d[i + 2];
    var dist = 765 - (r + g + b);
    if (dist <= 90) continue;
    ink++;
    if (r - g > 60 && r - b > 60) redDom++;
    if (dist > best) { best = dist; core = [r, g, b]; }
  }
  return { ink: ink, redDom: redDom, core: core };
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
): Promise<InkSample> {
  const s = await page.evaluate(
    (id) => (window as unknown as InkWindow).__ink(id),
    runId,
  );
  expect(s, `no readable canvas ink sample for ${runId}`).not.toBeNull();
  return s as InkSample;
}

function history(
  page: import("@playwright/test").Page,
): Promise<{ undo: number; redo: number }> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __editor_store: {
          history: { size(): { undo: number; redo: number } };
        };
      }
    ).__editor_store.history.size(),
  );
}

function selectedRunIds(
  page: import("@playwright/test").Page,
): Promise<string[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __editor_store: { selection: { value: { runIds: string[] } } };
        }
      ).__editor_store.selection.value.runIds,
  );
}

/** A run's model fill, as an "r,g,b" string. */
function modelFill(
  page: import("@playwright/test").Page,
  runId: string,
): Promise<string> {
  return page.evaluate((id) => {
    const w = window as unknown as {
      __editor_store: {
        state: {
          pages: {
            runs: { id: string; fill: { r: number; g: number; b: number } }[];
          }[];
        };
      };
    };
    for (const p of w.__editor_store.state.pages) {
      const run = p.runs.find((r) => r.id === id);
      if (run) return `${run.fill.r},${run.fill.g},${run.fill.b}`;
    }
    return "missing";
  }, runId);
}

/** Class name of whatever actually sits on top at a run's centre point. */
function topmostAt(
  page: import("@playwright/test").Page,
  runId: string,
): Promise<string> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="pdf-editor-run-${id}"]`);
    if (!el) return "missing";
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    if (!hit) return "none";
    return `${hit.tagName}.${typeof hit.className === "string" ? hit.className : ""}`;
  }, runId);
}

async function selectRun(page: import("@playwright/test").Page, runId: string) {
  await page.locator(`[data-testid="pdf-editor-run-${runId}"]`).click();
  await page.waitForTimeout(350);
  await expect(page.getByTestId("pdf-editor-colour")).toBeEnabled();
}

async function setFill(page: import("@playwright/test").Page, hex: string) {
  const colour = page.getByTestId("pdf-editor-colour");
  await colour.fill(hex);
  await colour.press("Enter");
}

test.describe("PDF text editor - fill colour picker", () => {
  // (A) + (B). The picker was still open when Undo was clicked; the blur
  // re-applied the colour, so the undo popped a no-op step and the text stayed
  // red - and dismissing the picker on its own left a second undo entry.
  test("a colour pick is one undo step, and undo removes the colour", async ({
    page,
  }) => {
    await openEditor(page, PARAGRAPH_PDF);
    await selectRun(page, HEADING);

    const clean = await history(page);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await page.waitForTimeout(1200);

    const red = await sample(page, HEADING);
    const redFill = await modelFill(page, HEADING);
    const afterPick = await history(page);
    expect(
      red.redDom,
      `the pick must land first: redDom=${red.redDom} fill=${redFill}`,
    ).toBeGreaterThan(200);

    // (A) Dwell well past the 600ms coalesce window, then undo straight from
    // the picker - the click that reaches Undo also dismisses the dropdown.
    await page.waitForTimeout(1500);
    await page.getByTestId("pdf-editor-undo").click();
    await page.waitForTimeout(1500);

    const after = await sample(page, HEADING);
    const afterFill = await modelFill(page, HEADING);
    const afterUndo = await history(page);
    expect(
      after.redDom,
      `undo must clear the red pixels (redDom ${red.redDom} -> ${after.redDom}, fill ${redFill} -> ${afterFill}, history ${afterPick.undo}/${afterPick.redo} -> ${afterUndo.undo}/${afterUndo.redo})`,
    ).toBeLessThan(20);
    expect(afterFill, "undo must restore the original fill").not.toBe(redFill);
    expect(afterUndo.undo, "one undo must empty the stack again").toBe(
      clean.undo,
    );

    // (B) Pick again and dismiss the picker deliberately: dismissing must not
    // bank a second entry on top of the pick.
    await selectRun(page, HEADING);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await page.waitForTimeout(1200);
    const secondPick = await history(page);
    await page.getByTestId("pdf-editor-colour").blur();
    await page.waitForTimeout(1200);
    const afterDismiss = await history(page);
    expect(
      afterDismiss.undo - clean.undo,
      `one colour pick must stay one undo entry (after pick ${secondPick.undo}, after dismiss ${afterDismiss.undo})`,
    ).toBe(1);
  });

  // (C) The saturation dropdown is portalled over the top of the page, so a
  // committed pick has to close it or it eats the next click on a run.
  test("the picker does not sit over the page after a pick", async ({
    page,
  }) => {
    await openEditor(page, PARAGRAPH_PDF);
    await selectRun(page, BODY);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await page.waitForTimeout(1200);

    // The heading sits directly under where the dropdown opens.
    const onTop = await topmostAt(page, HEADING);
    expect(
      onTop,
      "nothing from the colour picker may cover the page after a pick",
    ).not.toContain("ColorInput");

    // ...so one click - not a priming click - selects that run.
    await page
      .locator(`[data-testid="pdf-editor-run-${HEADING}"]`)
      .click({ timeout: 5_000 });
    await page.waitForTimeout(500);
    expect(
      await selectedRunIds(page),
      "the first click after a colour pick must reach the run",
    ).toEqual([HEADING]);
  });

  // The "don't re-apply the same colour" guard is keyed on the selection's own
  // fill, which is null for a MIXED selection - so dragging in the dropdown
  // still unifies one. This is also the only test here that picks with the
  // mouse instead of the text field.
  test("a dropdown pick still unifies a mixed selection", async ({ page }) => {
    await openEditor(page, PARAGRAPH_PDF);
    await selectRun(page, HEADING);
    await setFill(page, "#cc0000"); // theme-allow-color PDF ink, matched against the rendered bitmap
    await page.waitForTimeout(1200);
    expect(
      (await sample(page, HEADING)).redDom,
      "the heading must be red first",
    ).toBeGreaterThan(200);

    // Heading (red) + body (black): a mixed fill, so the picker falls back to
    // #000000 and reports nothing as the selection's colour.
    await page.locator(`[data-testid="pdf-editor-run-${HEADING}"]`).click();
    await page
      .locator(`[data-testid="pdf-editor-run-${BODY}"]`)
      .click({ modifiers: ["Shift"] });
    await page.waitForTimeout(400);
    expect(
      (await selectedRunIds(page)).length,
      "the selection must span both runs",
    ).toBe(2);
    expect(await page.getByTestId("pdf-editor-colour").inputValue()).toBe(
      "#000000",
    );

    // Open the picker and pick out of the saturation square itself.
    await page.getByTestId("pdf-editor-colour").click();
    const overlay = page
      .locator(".mantine-ColorInput-saturationOverlay")
      .first();
    await expect(overlay).toBeVisible({ timeout: 3_000 });
    // The saturation area stacks three overlays; click the container itself.
    const saturation = page.locator(".mantine-ColorInput-saturation").first();
    const box = (await saturation.boundingBox())!;
    await saturation.click({ position: { x: box.width - 4, y: 4 } });
    await page.waitForTimeout(1500);

    const headingFill = await modelFill(page, HEADING);
    const bodyFill = await modelFill(page, BODY);
    expect(
      headingFill,
      `a mixed selection must end up unified (heading ${headingFill}, body ${bodyFill})`,
    ).toBe(bodyFill);
    expect(bodyFill, "the body must have been recoloured too").not.toBe(
      "0,0,0",
    );
  });

  test("Escape closes the colour dropdown", async ({ page }) => {
    await openEditor(page, PARAGRAPH_PDF);
    await selectRun(page, HEADING);

    const overlay = page
      .locator(".mantine-ColorInput-saturationOverlay")
      .first();
    await page.getByTestId("pdf-editor-colour").click();
    await expect(
      overlay,
      "clicking the swatch should open the picker",
    ).toBeVisible({ timeout: 3_000 });

    await page.getByTestId("pdf-editor-colour").press("Escape");
    await expect(
      overlay,
      "Escape should dismiss the colour dropdown",
    ).toBeHidden({ timeout: 3_000 });
  });
});
