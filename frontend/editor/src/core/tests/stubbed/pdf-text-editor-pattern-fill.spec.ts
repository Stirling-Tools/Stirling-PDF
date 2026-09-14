import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Regeneration drops `sh` shadings, which the save-time repair puts back. It
// does NOT drop a pattern colour space fill - pin that so a PDFium upgrade
// cannot regress it silently into the same class of loss.
test("a pattern colour space fill survives regeneration", async ({ page }) => {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(
      path.join(
        import.meta.dirname,
        "../test-fixtures/pattern-fill-sample.pdf",
      ),
    );
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const s = (window as any).__editor_store;
    const doc = s.doc ?? s.document;
    const m = doc.module;
    const p = doc.page(0);

    // Sample the middle of the patterned rectangle.
    const sample = (): number[] => {
      const w = 200;
      const h = 200;
      const bmp = m.FPDFBitmap_Create(w, h, 1);
      m.FPDFBitmap_FillRect(bmp, 0, 0, w, h, 0xffffffff);
      m.FPDF_RenderPageBitmap(bmp, p.pagePtr, 0, 0, w, h, 0, 0x01 | 0x10);
      const buf = m.FPDFBitmap_GetBuffer(bmp);
      const stride = m.FPDFBitmap_GetStride(bmp);
      const heap = new Uint8Array(
        (m.pdfium.wasmExports as any).memory.buffer,
        buf,
        stride * h,
      );
      const at = (x: number, y: number): number[] => {
        const o = y * stride + x * 4;
        return [heap[o], heap[o + 1], heap[o + 2]];
      };
      // Left, middle and right of the gradient band (page y=140 -> device y=60).
      const out = [...at(40, 60), ...at(100, 60), ...at(160, 60)];
      m.FPDFBitmap_Destroy(bmp);
      return out;
    };

    const before = sample();
    m.FPDFPage_GenerateContent(p.pagePtr);
    const after = sample();
    return { before, after, changed: before.join() !== after.join() };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  // Red at the left, blue at the right: the axial shading really painted.
  expect(result.before[0]).toBeGreaterThan(result.before[2]);
  expect(result.before[8]).toBeGreaterThan(result.before[6]);
  expect(result.changed).toBe(false);
});
