import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// The page bitmap must render at devicePixelRatio x the zoom scale, or every
// HiDPI display shows a browser-upscaled blur ("it looks low res"). The CSS
// layout size must NOT follow the ratio - overlays, clicks and geometry are
// all CSS-based and would drift if it did.

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

async function open(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1000);
}

interface CanvasGeom {
  bitmapW: number;
  bitmapH: number;
  cssW: number;
  cssH: number;
  pageWidthPt: number;
  renderScale: number;
  dpr: number;
}

function canvasGeom(page: Page): Promise<CanvasGeom> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="v2-page-0"]')!;
    const canvas = el.querySelector("canvas") as HTMLCanvasElement;
    const cb = canvas.getBoundingClientRect();
    const store = (
      window as unknown as {
        __v2_editor_store: {
          getState(): {
            renderScale: number;
            pages: { width: number }[];
          };
        };
      }
    ).__v2_editor_store;
    const st = store.getState();
    return {
      bitmapW: canvas.width,
      bitmapH: canvas.height,
      cssW: cb.width,
      cssH: cb.height,
      pageWidthPt: st.pages[0].width,
      renderScale: st.renderScale,
      dpr: window.devicePixelRatio || 1,
    };
  });
}

test.describe("v2 editor - HiDPI rendering", () => {
  test.describe("on a 2x display", () => {
    test.use({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } });

    test("the bitmap carries 2x the pixels of its CSS box", async ({
      page,
    }) => {
      await open(page);
      const g = await canvasGeom(page);
      expect(g.dpr).toBe(2);
      // Layout stays at the zoom scale...
      expect(g.cssW).toBeCloseTo(g.pageWidthPt * g.renderScale, 0);
      // ...while the bitmap renders at zoom x ratio - the whole fix.
      expect(g.bitmapW).toBe(
        Math.max(1, Math.round(g.pageWidthPt * g.renderScale * 2)),
      );
      expect(g.bitmapW / g.cssW).toBeCloseTo(2, 1);
    });
  });

  test.describe("on a 1x display", () => {
    test.use({ deviceScaleFactor: 1, viewport: { width: 1440, height: 900 } });

    test("the bitmap matches the CSS box", async ({ page }) => {
      await open(page);
      const g = await canvasGeom(page);
      expect(g.dpr).toBe(1);
      expect(g.bitmapW).toBe(
        Math.max(1, Math.round(g.pageWidthPt * g.renderScale)),
      );
      expect(g.bitmapW / g.cssW).toBeCloseTo(1, 1);
    });
  });
});
