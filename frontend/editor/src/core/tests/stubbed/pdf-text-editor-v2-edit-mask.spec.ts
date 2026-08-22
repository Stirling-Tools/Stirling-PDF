import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

test.describe("PDF text editor v2 - editing surface", () => {
  const openAndEdit = async (
    page: import("@playwright/test").Page,
    fixture: string,
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
    const run = page.locator('[data-testid^="v2-run-p0-"]').first();
    await run.click();
    await page.keyboard.type("X");
    await page.waitForTimeout(150);
    return run;
  };

  const alphaOf = (css: string): number => {
    const parts = (/rgba?\(([^)]+)\)/.exec(css)?.[1] ?? "")
      .split(",")
      .map((p) => parseFloat(p.trim()));
    return parts.length === 4 ? parts[3] : 1;
  };

  test("editing does not cover the page with an opaque mask", async ({
    page,
  }) => {
    const run = await openAndEdit(page, "sample");
    const bg = await run.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(bg)).toBeLessThan(0.5);
  });

  test("editing paints no glyphs of its own", async ({ page }) => {
    const run = await openAndEdit(page, "sample");
    const color = await run.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgba(0, 0, 0, 0)");
  });

  test("the typed character reaches the page itself", async ({ page }) => {
    const run = await openAndEdit(page, "sample");
    await expect(run).toContainText("X");
    const model = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page(i: number): { runs: Array<{ text: string }> } };
          };
        }
      ).__v2_editor_store;
      return store.doc.page(0).runs[0]?.text ?? "";
    });
    expect(model).toContain("X");
  });

  test("a coloured page is not banded while editing", async ({ page }) => {
    const run = await openAndEdit(page, "stirling-marketing");
    const bg = await run.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(bg)).toBeLessThan(0.5);
  });
});
