import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

// The editor draws the page with FPDF_ANNOT, so annotation text is baked into
// the page canvas. The viewer-only eye toggle used to leave both the baked
// annotations and the "not editable here" outlines on screen.
const ANNOT_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/annotation-text-sample.pdf",
);

/** PDF-space rect of the form widget's visible field. */
const WIDGET_RECT = { x: 30, y: 180, width: 220, height: 24 };
/** PDF-space rect of the page's own editable text, above the annotations. */
const PAGE_TEXT_RECT = { x: 30, y: 242, width: 220, height: 24 };

interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dark, painted pixels inside a PDF-space rect on the editor page canvas. */
async function inkIn(page: Page, rect: PdfRect): Promise<number> {
  return page.evaluate(({ x, y, width, height }) => {
    const store = (
      window as unknown as {
        __editor_store?: {
          state?: { pages?: Array<{ width: number; height: number }> };
        };
      }
    ).__editor_store;
    const pageState = store?.state?.pages?.[0];
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="pdf-editor-page-0"] canvas[data-page-canvas]',
    );
    if (!pageState || !canvas) return -1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return -1;
    const sx = canvas.width / pageState.width;
    const sy = canvas.height / pageState.height;
    const left = Math.max(0, Math.round(x * sx));
    const top = Math.max(0, Math.round((pageState.height - y - height) * sy));
    const w = Math.min(canvas.width - left, Math.round(width * sx));
    const h = Math.min(canvas.height - top, Math.round(height * sy));
    if (w <= 0 || h <= 0) return -1;
    const data = ctx.getImageData(left, top, w, h).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Alpha guards against reading the transparent default canvas as ink.
      if (
        data[i + 3] > 0 &&
        data[i] < 128 &&
        data[i + 1] < 128 &&
        data[i + 2] < 128
      )
        dark++;
    }
    return dark;
  }, rect);
}

const ANNOTATION_MODEL_COUNT = `(() => {
  const store = window.__editor_store;
  return store?.state?.pages?.[0]?.annotations?.length ?? -1;
})()`;

const DOCUMENT_DIRTY = `(() => {
  const store = window.__editor_store;
  return store?.state?.dirty ?? null;
})()`;

test.describe("PDF text editor - annotation visibility", () => {
  test("the eye toggle hides annotation text and outlines without changing the raster", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openInTextEditor(page, ANNOT_PDF);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => inkIn(page, WIDGET_RECT), { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(await inkIn(page, PAGE_TEXT_RECT)).toBeGreaterThan(0);

    const outlines = page.locator('[data-testid^="pdf-editor-annot-p0-"]');
    await expect(outlines).toHaveCount(2);
    expect(await page.evaluate(ANNOTATION_MODEL_COUNT)).toBe(2);
    expect(await page.evaluate(DOCUMENT_DIRTY)).toBe(false);
    const raster = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="pdf-editor-page-0"] canvas[data-page-canvas]',
      );
      if (!canvas) throw new Error("page canvas missing");
      return {
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width,
        cssHeight: canvas.getBoundingClientRect().height,
      };
    });

    const toggle = page.getByTestId("viewer-annotation-visibility");
    await toggle.click();

    await expect(outlines).toHaveCount(0);
    expect(await page.evaluate(ANNOTATION_MODEL_COUNT)).toBe(2);
    expect(await page.evaluate(DOCUMENT_DIRTY)).toBe(false);
    await expect
      .poll(() => inkIn(page, WIDGET_RECT), { timeout: 20_000 })
      .toBe(0);
    // The page's own text must survive the annotation pass.
    expect(await inkIn(page, PAGE_TEXT_RECT)).toBeGreaterThan(0);
    const hiddenRaster = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="pdf-editor-page-0"] canvas[data-page-canvas]',
      );
      if (!canvas) throw new Error("page canvas missing");
      return {
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width,
        cssHeight: canvas.getBoundingClientRect().height,
      };
    });
    // Hiding annotations redraws the same bitmap; it must not change the
    // render scale, which would read as the page losing sharpness.
    expect(hiddenRaster).toEqual(raster);

    await toggle.click();
    await expect(outlines).toHaveCount(2);
    await expect
      .poll(() => inkIn(page, WIDGET_RECT), { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(await inkIn(page, PAGE_TEXT_RECT)).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-testid="pdf-editor-page-0"] canvas[data-page-canvas]',
        );
        return canvas ? { width: canvas.width, height: canvas.height } : null;
      }),
    ).toEqual({ width: raster.width, height: raster.height });
  });
});
