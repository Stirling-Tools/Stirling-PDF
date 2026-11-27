import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const ANNOT_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/annotation-text-sample.pdf",
);

interface PageRaster {
  bitmapWidth: number;
  bitmapHeight: number;
  cssWidth: number;
  cssHeight: number;
}

/** The current page tile's bitmap, excluding the low-res preview fallback. */
function pageRaster(): PageRaster | null {
  const pageEl = document.querySelector('[data-page-index="0"]');
  if (!pageEl) return null;
  const img = pageEl.querySelector<HTMLImageElement>(
    "img:not(.pdf-page-preview)",
  );
  if (!img || !img.naturalWidth) return null;
  const rect = img.getBoundingClientRect();
  return {
    bitmapWidth: img.naturalWidth,
    bitmapHeight: img.naturalHeight,
    cssWidth: Math.round(rect.width),
    cssHeight: Math.round(rect.height),
  };
}

async function waitForTile(page: Page): Promise<PageRaster> {
  await expect
    .poll(
      async () => {
        const raster = await page.evaluate(pageRaster);
        if (!raster || !raster.cssWidth) return 0;
        return raster.bitmapWidth / raster.cssWidth;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(1.9);
  const raster = await page.evaluate(pageRaster);
  if (!raster) throw new Error("page tile did not render");
  return raster;
}

test.describe("Viewer - hidden annotation layer", () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } });

  test("leaves the mounted layer out of paint and the page raster unchanged", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="file"]').first().setInputFiles(ANNOT_PDF);

    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage).toBeVisible({ timeout: 30_000 });
    const annotation = firstPage.getByText("FreeText annotation body").first();
    await expect(annotation).toBeVisible({ timeout: 30_000 });

    const raster = await waitForTile(page);
    expect(raster.bitmapWidth).toBe(raster.cssWidth * 2);

    const toggle = page.getByTestId("viewer-annotation-visibility");
    await toggle.click();
    await expect(annotation).toBeHidden();

    // The layer stays mounted; only its paint is suppressed. Visibility
    // inherits to every annotation renderer, unlike a transparent overlay.
    await expect(annotation).toHaveCount(1);
    const styles = await annotation.evaluate((el) => {
      const s = getComputedStyle(el);
      return { visibility: s.visibility, opacity: s.opacity };
    });
    expect(styles.visibility).toBe("hidden");
    expect(styles.opacity).toBe("1");

    // Compositor rasterization is browser-specific and not observable from
    // DOM geometry; this guards the contract we can assert: the page bitmap's
    // delivered scale and box do not change across the toggle.
    expect(await page.evaluate(pageRaster)).toEqual(raster);

    await toggle.click();
    await expect(annotation).toBeVisible();
    expect(await page.evaluate(pageRaster)).toEqual(raster);
  });
});
