import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// While a run is being edited the overlay covers the original glyphs. The mask
// used to be a translucent near-white/near-black picked from the TEXT colour,
// so on a coloured page it painted a grey band and the original text ghosted
// through it. It has to be the page's own colour, fully opaque.
test.describe("PDF text editor v2 - editing mask", () => {
  const openAndEdit = async (
    page: import("@playwright/test").Page,
    fixture: string,
    beforeEdit?: () => Promise<void>,
  ) => {
    await page.goto("/pdf-text-editor?charcodeStrategy=content-stream", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, `../test-fixtures/${fixture}.pdf`),
      );
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);
    if (beforeEdit) await beforeEdit();
    const run = page.locator('[data-testid^="v2-run-p0-"]').first();
    await run.click();
    await page.keyboard.type("X");
    await page.waitForTimeout(150);
    return run;
  };

  const rgbOf = (css: string): number[] =>
    (/rgba?\(([^)]+)\)/.exec(css)?.[1] ?? "")
      .split(",")
      .map((p) => parseFloat(p.trim()));

  test("the mask is fully opaque, so the original glyphs cannot show through", async ({
    page,
  }) => {
    const run = await openAndEdit(page, "sample");
    const bg = await run.evaluate((el) => getComputedStyle(el).backgroundColor);
    const parts = rgbOf(bg);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    // A 4th component below 1 is the translucency that caused the ghosting.
    if (parts.length === 4) expect(parts[3]).toBe(1);
  });

  test("a white page gives pure white, not a quantised grey", async ({
    page,
  }) => {
    const run = await openAndEdit(page, "sample", async () => {
      await page
        .locator('[data-testid="v2-page-0"] canvas')
        .first()
        .evaluate((el) => {
          const canvas = el as HTMLCanvasElement;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("page canvas has no 2d context");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        });
    });
    const bg = await run.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
  });

  test("the mask takes the page's colour, not a guess from the text", async ({
    page,
  }) => {
    // This page's banner is dark red behind light text; the old mask painted
    // a dark grey band straight across it.
    const run = await openAndEdit(page, "stirling-marketing");
    const bg = await run.evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = rgbOf(bg);
    // Red-dominant, and clearly not a neutral grey.
    expect(r).toBeGreaterThan(g + 20);
    expect(r).toBeGreaterThan(b + 20);
  });
});
