import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// ADD-TEXT, judged on the PAGE BITMAP rather than on the store.
//
// Inserting a text box is the one editor gesture whose whole job is to produce
// ink where there was none: a new PDFium text object, a page regenerate, a
// repaint. Every assertion below is anchored on pixels read out of the page
// <canvas>, so a command that updates the run list without ever reaching the
// rendered page fails here even though the model looks correct.
//
// paragraph-sample renders 600x450 CSS at 1.5x and puts every one of its own
// glyphs in the top 190px, so the lower half is bare page: a box dropped there
// is unambiguously new ink, and a zero reading there is a real zero.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
const MANY_PAGES_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
);

type Rect = { x: number; y: number; w: number; h: number };

type Ink = {
  count: number;
  /** Bounding box of the marked pixels, in CSS px relative to the page element. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  meanR: number;
  meanG: number;
  meanB: number;
};

async function openEditor(page: import("@playwright/test").Page, file: string) {
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
 * Read the page bitmap inside `rect` (CSS px relative to the page element) and
 * summarise the marked pixels. `dark` counts near-black text ink; `any` counts
 * anything that is not close to page white, so coloured glyphs still register.
 */
function inkIn(
  page: import("@playwright/test").Page,
  pageIndex: number,
  rect: Rect,
  mode: "dark" | "any" = "dark",
): Promise<Ink> {
  return page.evaluate(
    ({ pageIndex, rect, mode }) => {
      const pageEl = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-page-${pageIndex}"]`,
      );
      if (!pageEl) throw new Error(`page ${pageIndex} not mounted`);
      const canvas = pageEl.querySelector("canvas");
      if (!canvas) throw new Error(`page ${pageIndex} has no canvas`);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const pb = pageEl.getBoundingClientRect();
      const cb = canvas.getBoundingClientRect();
      if (canvas.width === 0 || cb.width === 0) {
        throw new Error(`page ${pageIndex} canvas is not painted`);
      }
      const sx = canvas.width / cb.width;
      const sy = canvas.height / cb.height;
      const x0 = Math.max(0, Math.round((pb.left + rect.x - cb.left) * sx));
      const y0 = Math.max(0, Math.round((pb.top + rect.y - cb.top) * sy));
      const w = Math.min(canvas.width - x0, Math.round(rect.w * sx));
      const h = Math.min(canvas.height - y0, Math.round(rect.h * sy));
      if (w <= 0 || h <= 0) throw new Error("sample rect is off-canvas");
      const d = ctx.getImageData(x0, y0, w, h).data;
      let count = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const marked =
            mode === "dark"
              ? r < 160 && g < 160
              : 255 - r > 40 || 255 - g > 40 || 255 - b > 40;
          if (!marked) continue;
          count += 1;
          sr += r;
          sg += g;
          sb += b;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (count === 0) {
        return {
          count: 0,
          left: -1,
          right: -1,
          top: -1,
          bottom: -1,
          meanR: -1,
          meanG: -1,
          meanB: -1,
        };
      }
      // Canvas px -> CSS px relative to the page element.
      const toPageX = (cx: number) => (x0 + cx) / sx + cb.left - pb.left;
      const toPageY = (cy: number) => (y0 + cy) / sy + cb.top - pb.top;
      return {
        count,
        left: toPageX(minX),
        right: toPageX(maxX),
        top: toPageY(minY),
        bottom: toPageY(maxY),
        meanR: sr / count,
        meanG: sg / count,
        meanB: sb / count,
      };
    },
    { pageIndex, rect, mode },
  );
}

/** Poll the bitmap until two consecutive reads agree, so we never race a repaint. */
async function settledInk(
  page: import("@playwright/test").Page,
  pageIndex: number,
  rect: Rect,
  mode: "dark" | "any" = "dark",
  budgetMs = 12_000,
): Promise<Ink> {
  const deadline = Date.now() + budgetMs;
  let previous = await inkIn(page, pageIndex, rect, mode);
  while (Date.now() < deadline) {
    await page.waitForTimeout(350);
    const next = await inkIn(page, pageIndex, rect, mode);
    if (next.count === previous.count) return next;
    previous = next;
  }
  return previous;
}

/** Rows of the page bitmap that carry ink, grouped into contiguous bands. */
function rowBands(
  page: import("@playwright/test").Page,
  pageIndex: number,
  rect: Rect,
) {
  return page.evaluate(
    ({ pageIndex, rect }) => {
      const pageEl = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-page-${pageIndex}"]`,
      );
      const canvas = pageEl?.querySelector("canvas");
      const ctx = canvas?.getContext("2d");
      if (!pageEl || !canvas || !ctx) throw new Error("no page canvas");
      const pb = pageEl.getBoundingClientRect();
      const cb = canvas.getBoundingClientRect();
      const sx = canvas.width / cb.width;
      const sy = canvas.height / cb.height;
      const x0 = Math.max(0, Math.round((pb.left + rect.x - cb.left) * sx));
      const y0 = Math.max(0, Math.round((pb.top + rect.y - cb.top) * sy));
      const w = Math.min(canvas.width - x0, Math.round(rect.w * sx));
      const h = Math.min(canvas.height - y0, Math.round(rect.h * sy));
      if (w <= 0 || h <= 0) throw new Error("sample rect is off-canvas");
      const d = ctx.getImageData(x0, y0, w, h).data;
      const bands: Array<{ top: number; bottom: number; pixels: number }> = [];
      let open: { top: number; bottom: number; pixels: number } | null = null;
      for (let y = 0; y < h; y += 1) {
        let n = 0;
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if (d[i] < 160 && d[i + 1] < 160) n += 1;
        }
        const cssY = (y0 + y) / sy + cb.top - pb.top;
        if (n > 0) {
          if (open) {
            open.bottom = cssY;
            open.pixels += n;
          } else open = { top: cssY, bottom: cssY, pixels: n };
        } else if (open) {
          bands.push(open);
          open = null;
        }
      }
      if (open) bands.push(open);
      return bands;
    },
    { pageIndex, rect },
  );
}

/** Insert a box via the sidebar control at a point on the page, CSS px. */
async function addTextAt(
  page: import("@playwright/test").Page,
  pageIndex: number,
  x: number,
  y: number,
) {
  const runs = page.locator(`[data-testid^="pdf-editor-run-p${pageIndex}-"]`);
  const before = await runs.count();
  await page.getByTestId("pdf-editor-add-text").click();
  await expect(page.getByTestId("pdf-editor-add-text")).toContainText(
    /click page to add text/i,
  );
  await page
    .getByTestId(`pdf-editor-page-${pageIndex}`)
    .click({ position: { x, y } });
  await expect(runs).toHaveCount(before + 1, { timeout: 10_000 });
}

/** The testid of the most recently inserted run on a page. */
async function newestRunTestId(
  page: import("@playwright/test").Page,
  pageIndex: number,
) {
  const locator = page.locator(
    `[data-testid^="pdf-editor-run-p${pageIndex}-new-"]`,
  );
  const n = await locator.count();
  expect(n, "expected at least one inserted run").toBeGreaterThan(0);
  const id = await locator.nth(n - 1).getAttribute("data-testid");
  if (!id) throw new Error("inserted run has no testid");
  return id;
}

/** Replace a run's whole content, the way a user select-all + types would. */
async function replaceRunText(
  page: import("@playwright/test").Page,
  runTestId: string,
  text: string,
) {
  await page.evaluate(
    ({ runTestId, text }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${runTestId}"]`,
      );
      if (!el) throw new Error(`run ${runTestId} not in DOM`);
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no Selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    },
    { runTestId, text },
  );
}

async function blurRun(
  page: import("@playwright/test").Page,
  runTestId: string,
) {
  await page.evaluate((id) => {
    document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.blur();
  }, runTestId);
  await page.waitForTimeout(400);
}

const BLANK: Rect = { x: 60, y: 230, w: 480, h: 120 };
const PARAGRAPH: Rect = { x: 0, y: 0, w: 600, h: 200 };

test.describe("PDF text editor - add text, checked in the bitmap", () => {
  test("a fresh add-text box paints its placeholder glyphs onto the blank page bitmap", async ({
    page,
  }) => {
    // Fails if InsertTextCommand only updates the store, if the page never
    // regenerates, or if the glyphs land somewhere other than the click point.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    const wholePage = await inkIn(page, 0, { x: 0, y: 0, w: 600, h: 450 });
    expect(
      wholePage.count,
      "sampler must see the fixture's own text before we trust a zero elsewhere",
    ).toBeGreaterThan(2000);

    const before = await inkIn(page, 0, BLANK);
    expect(before.count, "lower half of the page starts blank").toBe(0);

    await addTextAt(page, 0, 150, 300);
    const after = await settledInk(page, 0, BLANK);

    expect(after.count, "placeholder glyphs must be inked").toBeGreaterThan(40);
    expect(
      after.bottom,
      `baseline should land on the clicked y=300, saw bottom=${after.bottom}`,
    ).toBeGreaterThan(292);
    expect(after.bottom).toBeLessThan(305);
    expect(
      after.left,
      `first glyph should start at the clicked x=150, saw left=${after.left}`,
    ).toBeGreaterThan(144);
    expect(after.left).toBeLessThan(162);
    expect(
      after.right - after.left,
      `"New text" at 12pt/1.5x should span roughly 45-90px, saw ${
        after.right - after.left
      }`,
    ).toBeGreaterThan(40);
    expect(after.right - after.left).toBeLessThan(110);
    expect(
      after.top,
      `cap height should sit ~12px above the baseline, saw top=${after.top}`,
    ).toBeGreaterThan(280);
    expect(after.top).toBeLessThan(295);
  });

  test("add-text mode ends after one insert - a second page click adds no more ink", async ({
    page,
  }) => {
    // Fails if setMode("select") after the insert is dropped and the tool keeps
    // stamping a box on every subsequent click of the page.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    await addTextAt(page, 0, 150, 270);
    const first = await settledInk(page, 0, BLANK);
    expect(first.count, "first insert must ink the page").toBeGreaterThan(40);

    await expect(page.getByTestId("pdf-editor-add-text")).toHaveText(
      /add text/i,
    );
    const secondSpot: Rect = { x: 60, y: 355, w: 480, h: 80 };
    expect(
      (await inkIn(page, 0, secondSpot)).count,
      "the second target area must start blank",
    ).toBe(0);

    await page
      .getByTestId("pdf-editor-page-0")
      .click({ position: { x: 150, y: 400 } });
    await page.waitForTimeout(2000);

    const secondInk = await inkIn(page, 0, secondSpot);
    expect(
      secondInk.count,
      `second click must not stamp a box, saw ${secondInk.count} inked px`,
    ).toBe(0);
    const firstAgain = await inkIn(page, 0, BLANK);
    expect(
      Math.abs(firstAgain.count - first.count),
      `the first box's ink must be untouched: ${first.count} -> ${firstAgain.count}`,
    ).toBeLessThan(4);
  });

  test("typing over the placeholder repaints the bitmap with the typed glyphs on the same baseline", async ({
    page,
  }) => {
    // Fails if an edit of a just-inserted run never reaches the page - the
    // overlay would read correctly while the bitmap still showed "New text".
    // "Wombat Wombat" is deliberately ascender-only, so the ink's top and
    // bottom are exactly the cap line and the baseline.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    await addTextAt(page, 0, 120, 300);
    const placeholder = await settledInk(page, 0, BLANK);
    expect(placeholder.count).toBeGreaterThan(40);

    const runId = await newestRunTestId(page, 0);
    await replaceRunText(page, runId, "Wombat Wombat");
    await blurRun(page, runId);
    const typed = await settledInk(page, 0, BLANK);

    expect(typed.count, "typed glyphs must be inked").toBeGreaterThan(40);
    expect(
      Math.abs(typed.bottom - placeholder.bottom),
      `baseline must not move: ${placeholder.bottom} -> ${typed.bottom}`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(typed.top - placeholder.top),
      `cap line must not move: ${placeholder.top} -> ${typed.top}`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(typed.left - placeholder.left),
      `pen origin must not move: ${placeholder.left} -> ${typed.left}`,
    ).toBeLessThanOrEqual(4);
    expect(
      typed.right - placeholder.right,
      `"Wombat Wombat" is far wider than "New text", so the ink must extend right: ${placeholder.right} -> ${typed.right}`,
    ).toBeGreaterThan(40);
  });

  test("undo after an add-text click wipes the new glyphs back to bare page", async ({
    page,
  }) => {
    // Fails if InsertTextCommand.revert leaves the PDFium object behind, or
    // reverts the model without re-rendering the page.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    const paragraphBefore = await inkIn(page, 0, PARAGRAPH);
    expect(paragraphBefore.count).toBeGreaterThan(2000);

    await addTextAt(page, 0, 150, 300);
    const added = await settledInk(page, 0, BLANK);
    expect(added.count, "insert must ink the page first").toBeGreaterThan(40);

    await page.getByTestId("pdf-editor-undo").click();
    const undone = await settledInk(page, 0, BLANK);
    expect(
      undone.count,
      `undo must remove every inserted pixel, ${undone.count} of ${added.count} remain`,
    ).toBe(0);

    const paragraphAfter = await inkIn(page, 0, PARAGRAPH);
    expect(
      Math.abs(paragraphAfter.count - paragraphBefore.count),
      `undo must not disturb the page's own text: ${paragraphBefore.count} -> ${paragraphAfter.count}`,
    ).toBeLessThan(paragraphBefore.count * 0.02);
  });

  test("Enter inside a fresh add-text box paints a second line of glyphs one leading below the first", async ({
    page,
  }) => {
    // A new box is ONE PDF text object, and a PDF text object cannot wrap: the
    // second line has to be emitted at its own pen origin. Fails if the newline
    // only exists in the contentEditable and the page still renders one line,
    // or if the second line lands at the wrong leading.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    const region: Rect = { x: 40, y: 220, w: 520, h: 200 };
    expect(
      (await inkIn(page, 0, region)).count,
      "the target area must start blank",
    ).toBe(0);

    await addTextAt(page, 0, 120, 280);
    const runId = await newestRunTestId(page, 0);
    await replaceRunText(page, runId, "Alpha");
    await page.waitForTimeout(600);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.type("Bravo");
    await blurRun(page, runId);
    await settledInk(page, 0, region);

    const bands = await rowBands(page, 0, region);
    expect(
      bands.length,
      `two typed lines must paint two ink bands, saw ${bands.length}: ${JSON.stringify(bands)}`,
    ).toBe(2);
    expect(
      bands[0].top,
      `first line's cap height should sit ~13px above the clicked baseline y=280, saw ${bands[0].top}`,
    ).toBeGreaterThan(262);
    expect(bands[0].top).toBeLessThan(273);
    // 12pt at 1.2 leading and 1.5x zoom is 21.6px between the two cap lines.
    expect(
      bands[1].top - bands[0].top,
      `second line must drop exactly one leading, saw ${bands[1].top - bands[0].top}px`,
    ).toBeGreaterThan(18);
    expect(bands[1].top - bands[0].top).toBeLessThan(26);
    expect(
      bands[1].top - bands[0].bottom,
      "the two lines must be separated by bare page, not merged into one band",
    ).toBeGreaterThan(1);
    expect(bands[0].pixels, "'Alpha' must be inked").toBeGreaterThan(40);
    expect(bands[1].pixels, "'Bravo' must be inked").toBeGreaterThan(40);
  });

  test("recolouring a fresh add-text box turns its bitmap glyphs red", async ({
    page,
  }) => {
    // Fails if the fill change lands in the store but the regenerated page
    // still draws the newly inserted box in the default black.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    await addTextAt(page, 0, 150, 300);
    const black = await settledInk(page, 0, BLANK);
    expect(black.count, "box starts as black ink").toBeGreaterThan(40);
    expect(
      black.meanR,
      `default fill must be dark, saw mean r=${black.meanR}`,
    ).toBeLessThan(150);

    await page.getByTestId("pdf-editor-colour").fill("#c02020"); // theme-allow-color test input for the picker, not a UI colour
    await page.getByTestId("pdf-editor-colour").blur();
    const coloured = await settledInk(page, 0, BLANK, "any");

    expect(coloured.count, "glyphs must still be painted").toBeGreaterThan(40);
    expect(
      coloured.meanR - coloured.meanG,
      `red channel must dominate: r=${coloured.meanR} g=${coloured.meanG}`,
    ).toBeGreaterThan(50);
    expect(
      coloured.meanR - coloured.meanB,
      `red channel must dominate: r=${coloured.meanR} b=${coloured.meanB}`,
    ).toBeGreaterThan(50);

    const stillBlack = await inkIn(page, 0, BLANK, "dark");
    expect(
      stillBlack.count,
      `near-black pixels must not survive the recolour, ${stillBlack.count} of ${black.count} did`,
    ).toBeLessThan(black.count * 0.15);
  });

  test("a fresh add-text box keeps its bitmap glyphs through blur and re-focus", async ({
    page,
  }) => {
    // Fails if re-focusing a pristine new box masks or re-lays-out the glyphs,
    // or if the editing overlay comes back out of register with the ink.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    await addTextAt(page, 0, 120, 300);
    const runId = await newestRunTestId(page, 0);
    await replaceRunText(page, runId, "Refocus");
    await blurRun(page, runId);
    const blurred = await settledInk(page, 0, BLANK);
    expect(blurred.count, "typed glyphs must be on the page").toBeGreaterThan(
      40,
    );

    await page.locator(`[data-testid="${runId}"]`).click();
    await expect(page.locator(`[data-testid="${runId}"]`)).toBeFocused();
    await page.waitForTimeout(800);

    const refocused = await inkIn(page, 0, BLANK);
    expect(
      Math.abs(refocused.count - blurred.count) / blurred.count,
      `re-focus must not repaint the glyphs: ${blurred.count} -> ${refocused.count}`,
    ).toBeLessThan(0.08);
    for (const edge of ["left", "right", "bottom"] as const) {
      expect(
        Math.abs(refocused[edge] - blurred[edge]),
        `re-focus moved the ${edge} edge of the ink from ${blurred[edge]} to ${refocused[edge]}`,
      ).toBeLessThanOrEqual(2);
    }

    // The editing box must sit over its own ink, not beside it.
    const geometry = await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      const pageEl = document.querySelector<HTMLElement>(
        '[data-testid="pdf-editor-page-0"]',
      );
      if (!el || !pageEl) return null;
      const r = el.getBoundingClientRect();
      const p = pageEl.getBoundingClientRect();
      return {
        left: r.left - p.left,
        right: r.right - p.left,
        top: r.top - p.top,
        bottom: r.bottom - p.top,
      };
    }, runId);
    expect(geometry, "run overlay must still be mounted").not.toBeNull();
    expect(
      geometry!.left,
      `overlay left ${geometry!.left} must not start right of the ink at ${refocused.left}`,
    ).toBeLessThanOrEqual(refocused.left + 3);
    expect(
      geometry!.right,
      `overlay right ${geometry!.right} must reach the ink's right edge ${refocused.right}`,
    ).toBeGreaterThanOrEqual(refocused.right - 3);
    expect(
      geometry!.top,
      `overlay top ${geometry!.top} must be above the ink top ${refocused.top}`,
    ).toBeLessThanOrEqual(refocused.top + 3);
    expect(
      geometry!.bottom,
      `overlay bottom ${geometry!.bottom} must be below the ink bottom ${refocused.bottom}`,
    ).toBeGreaterThanOrEqual(refocused.bottom - 3);

    await expect(page.locator(`[data-testid="${runId}"]`)).toHaveText(
      "Refocus",
    );
  });

  test("two add-text boxes paint two separate ink bands at their own baselines", async ({
    page,
  }) => {
    // Fails if the second insert overwrites, moves or merges with the first -
    // the row profile would then show one band instead of two.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    const region: Rect = { x: 40, y: 220, w: 520, h: 200 };
    expect(
      (await inkIn(page, 0, region)).count,
      "the two-box region must start blank",
    ).toBe(0);

    await addTextAt(page, 0, 120, 260);
    await settledInk(page, 0, region);
    await addTextAt(page, 0, 300, 380);
    await settledInk(page, 0, region);

    const bands = await rowBands(page, 0, region);
    expect(
      bands.length,
      `expected two ink bands, saw ${bands.length}: ${JSON.stringify(bands)}`,
    ).toBe(2);
    expect(
      bands[0].bottom,
      `first baseline should be y=260, saw ${bands[0].bottom}`,
    ).toBeGreaterThan(252);
    expect(bands[0].bottom).toBeLessThan(265);
    expect(
      bands[1].bottom,
      `second baseline should be y=380, saw ${bands[1].bottom}`,
    ).toBeGreaterThan(372);
    expect(bands[1].bottom).toBeLessThan(385);
    expect(
      bands[1].top - bands[0].bottom,
      "the two bands must be separated by bare page",
    ).toBeGreaterThan(80);
    expect(bands[0].pixels, "first band must carry glyphs").toBeGreaterThan(40);
    expect(bands[1].pixels, "second band must carry glyphs").toBeGreaterThan(
      40,
    );
  });

  test("add-text on a scrolled-to later page inks that page and leaves page one alone", async ({
    page,
  }) => {
    // Fails if the click handler always targets page 0, or converts client
    // coords with the wrong page's transform once the stage has scrolled.
    test.setTimeout(120_000);
    await openEditor(page, MANY_PAGES_PDF);

    const zeroRect: Rect = { x: 0, y: 0, w: 600, h: 800 };
    const pageZeroBefore = await inkIn(page, 0, zeroRect);
    expect(
      pageZeroBefore.count,
      "page 1 must carry its own text for the comparison to mean anything",
    ).toBeGreaterThan(200);

    await page.getByTestId("pdf-editor-page-2").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("pdf-editor-page-2")).toBeVisible();
    await page.waitForTimeout(2500);
    const box = await page.getByTestId("pdf-editor-page-2").boundingBox();
    expect(box, "page 3 must be laid out").not.toBeNull();
    const baselineY = Math.round(box!.height * 0.6);

    const spot: Rect = {
      x: 40,
      y: baselineY - 40,
      w: box!.width - 80,
      h: 80,
    };
    expect(
      (await inkIn(page, 2, spot)).count,
      "the chosen spot on page 3 must start blank",
    ).toBe(0);

    await addTextAt(page, 2, 100, baselineY);
    const after = await settledInk(page, 2, spot);
    expect(after.count, "page 3 must gain the new glyphs").toBeGreaterThan(40);
    expect(
      Math.abs(after.bottom - baselineY),
      `glyphs must sit on the clicked baseline y=${baselineY}, saw ${after.bottom}`,
    ).toBeLessThan(8);
    expect(
      Math.abs(after.left - 100),
      `glyphs must start at the clicked x=100, saw ${after.left}`,
    ).toBeLessThan(12);

    await page.getByTestId("pdf-editor-page-0").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    const pageZeroAfter = await settledInk(page, 0, zeroRect);
    expect(
      Math.abs(pageZeroAfter.count - pageZeroBefore.count),
      `page 1 bitmap must be untouched by an insert on page 3: ${pageZeroBefore.count} -> ${pageZeroAfter.count}`,
    ).toBeLessThanOrEqual(2);
  });

  test("the added glyphs are page content, not the editing overlay painting itself", async ({
    page,
  }) => {
    // Fails if a new box only "appears" because its contentEditable draws text
    // on top: hide every overlay and the page bitmap must be unchanged.
    test.setTimeout(120_000);
    await openEditor(page, PARAGRAPH_PDF);

    await addTextAt(page, 0, 150, 300);
    const visible = await settledInk(page, 0, BLANK);
    expect(visible.count).toBeGreaterThan(40);

    const overlays = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid^="pdf-editor-run-p0-"]',
        ),
      );
      els.forEach((el) => {
        el.style.display = "none";
      });
      return els.length;
    });
    expect(
      overlays,
      "the fixture's runs plus the new box must be present to hide",
    ).toBeGreaterThan(1);
    await page.waitForTimeout(600);

    const bare = await inkIn(page, 0, BLANK);
    expect(
      bare.count,
      `page bitmap must keep the glyphs with every overlay hidden, saw ${bare.count} vs ${visible.count}`,
    ).toBeGreaterThan(40);
    expect(
      Math.abs(bare.count - visible.count) / visible.count,
      `hiding the overlays must not change the page ink: ${visible.count} -> ${bare.count}`,
    ).toBeLessThan(0.02);
    expect(
      Math.abs(bare.bottom - visible.bottom),
      "the baseline of the page ink must not move when overlays are hidden",
    ).toBeLessThanOrEqual(1);
  });
});
