import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Locator, Page } from "@playwright/test";
import path from "path";

// The editing surface contract: from the first keystroke the overlay owns the
// run's glyphs, painted on the engine's advances over an opaque mask sampled
// from the page itself. The page bitmap re-rasterises behind it, so the caret
// and the characters the user sees never wait for a raster.
test.describe("PDF text editor - editing surface", () => {
  const openAndEdit = async (page: Page, fixture: string): Promise<Locator> => {
    await page.goto("/pdf-text-editor?charcodeStrategy=content-stream", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 30_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, `../test-fixtures/${fixture}.pdf`),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);
    const run = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
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

  const rgbOf = (css: string): number[] => {
    const parts = (/rgba?\(([^)]+)\)/.exec(css)?.[1] ?? "")
      .split(",")
      .slice(0, 3)
      .map((p) => parseFloat(p.trim()));
    return parts.length === 3 ? parts : [0, 0, 0];
  };

  /** Background colour of the rendered page just above a run's glyphs. */
  const pageBackgroundBehind = (run: Locator): Promise<number[]> =>
    run.evaluate((el) => {
      const canvas = el
        .closest("[data-testid^='pdf-editor-page-']")
        ?.querySelector("canvas") as HTMLCanvasElement | null;
      const ctx = canvas?.getContext("2d") ?? null;
      if (!canvas || !ctx) return [255, 255, 255];
      const box = canvas.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const sx = canvas.width / box.width;
      const sy = canvas.height / box.height;
      const x = Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.round((rect.left - box.left + rect.width / 2) * sx),
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.round((rect.top - box.top + rect.height * 0.12) * sy),
        ),
      );
      return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    });

  test("the overlay paints the edited run from the first keystroke", async ({
    page,
  }) => {
    const run = await openAndEdit(page, "sample");
    const style = await run.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });
    expect(style.color, "typed glyphs must be visible immediately").not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(alphaOf(style.background), "the page ink must be masked").toBe(1);
  });

  test("the typed character reaches the page itself", async ({ page }) => {
    const run = await openAndEdit(page, "sample");
    await expect(run).toContainText("X");
    const model = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __editor_store: {
            doc: { page(i: number): { runs: Array<{ text: string }> } };
          };
        }
      ).__editor_store;
      return store.doc.page(0).runs[0]?.text ?? "";
    });
    expect(model).toContain("X");
  });

  test("the mask matches the page colour, not a default band", async ({
    page,
  }) => {
    const run = await openAndEdit(page, "stirling-marketing");
    const style = await run.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });
    expect(alphaOf(style.background)).toBe(1);
    const pageRgb = await pageBackgroundBehind(run);
    const maskRgb = rgbOf(style.background);
    for (let i = 0; i < 3; i += 1) {
      expect(
        Math.abs(maskRgb[i] - pageRgb[i]),
        `mask ${maskRgb.join(",")} should match page ${pageRgb.join(",")}`,
      ).toBeLessThanOrEqual(12);
    }
  });

  test("a duplicate input event does not leave the mask stuck after blur", async ({
    page,
  }) => {
    const run = await openAndEdit(page, "sample");
    // ContentEditable can emit a second input for the same text. No command
    // runs for it, so it must not arm the keep-glyphs-until-raster latch.
    await run.evaluate((el) => {
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: null,
        }),
      );
      el.blur();
    });
    await expect
      .poll(() => run.evaluate((el) => getComputedStyle(el).color), {
        timeout: 5_000,
      })
      .toBe("rgba(0, 0, 0, 0)");
  });

  test("a typing burst keeps the run on the overlay's glyphs", async ({
    page,
  }) => {
    const run = await openAndEdit(page, "sample");
    const states: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.type("a");
      await page.waitForTimeout(60);
      const state = await run.evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.color}|${s.backgroundColor}`;
      });
      states.push(state);
    }
    const transparent = states.filter((s) => s.startsWith("rgba(0, 0, 0, 0)"));
    expect(
      transparent.slice(0, 5),
      "the run handed glyphs back to the bitmap mid-burst",
    ).toEqual([]);
  });
});
