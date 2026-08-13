import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// A PDF's /Widths override the face's own advances, so the browser lays the
// same string out at a different width even with the document's font embedded
// (measured 9-15% out on these fixtures). Whenever the overlay paints visible
// glyphs over the bitmap, that gap is what the user sees as misalignment.
const FIXTURES = ["sample", "subset-font-sample", "mushroom-life"];

for (const name of FIXTURES) {
  test(`edited overlay text spans the PDF's own width (${name})`, async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, `../test-fixtures/${name}.pdf`),
      );
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);

    const target = page.locator('[data-testid^="v2-run-p0-"]').first();
    await expect(target).toBeVisible({ timeout: 30_000 });
    await target.click();
    await page.keyboard.press("End");
    await page.keyboard.type("Q");
    await page.waitForTimeout(700);

    const drift = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any;
      const doc = w.__v2_editor_store.doc ?? w.__v2_editor_store.document;
      const p0 = doc.page(0);
      const pageEl = document.querySelector<HTMLElement>(
        '[data-testid="v2-page-0"]',
      )!;
      const scale = pageEl.getBoundingClientRect().width / p0.width;
      const r = p0.runs[0];
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${r.id}"]`,
      )!;
      const cs = getComputedStyle(el);
      const c = document.createElement("canvas").getContext("2d")!;
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      // Account for the fit: tracking lands on every character, and any
      // horizontal scale shows up in the element's own transform.
      const ls = parseFloat(cs.letterSpacing) || 0;
      const sx = /matrix\(([-0-9.]+)/.exec(cs.transform);
      const scaleX =
        sx && Number.isFinite(parseFloat(sx[1])) ? parseFloat(sx[1]) : 1;
      const cssW =
        (c.measureText(r.text).width + ls * [...r.text].length) * scaleX;
      const pdfW = r.bounds.width * scale;
      return {
        text: r.text,
        cssW,
        pdfW,
        ratio: cssW / Math.max(1e-6, pdfW),
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    // The edit landed, so the overlay really is painting CSS glyphs now.
    expect(drift.text).toContain("Q");
    // Within 2% of the PDF's advance width. Unfitted, these fixtures were
    // 9-15% out, which is tens of pixels on a line of body text.
    expect(Math.abs(drift.ratio - 1)).toBeLessThan(0.02);
  });
}
