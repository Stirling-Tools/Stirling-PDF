import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// A rotated run's editable box was axis-aligned while its glyphs were not, so
// the box covered only part of the text it was supposed to be. Everything that
// depends on that box - clicking into the run, the hover ring, marquee hit
// testing, the caret - was therefore wrong for any rotated text.
//
// This measures the box against the run's OWN ink on the page bitmap: how much
// of the ink falls inside the box, and how much of the box is empty page.

const ROTATED = path.join(
  import.meta.dirname,
  "../test-fixtures/rotated-text-sample.pdf",
);

async function open(page: Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
}

/**
 * Ink coverage for one run's box.
 *
 * Scans the page canvas over the union of the box and the run's model bounds,
 * and reports how many dark pixels fall inside the box versus outside it.
 */
function coverage(page: Page, testId: string) {
  return page.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) return null;
    const canvas = el
      .closest("[data-testid^='v2-page-']")
      ?.querySelector("canvas") as HTMLCanvasElement | null;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    const cb = canvas.getBoundingClientRect();
    const sx = canvas.width / cb.width;
    const sy = canvas.height / cb.height;
    const b = el.getBoundingClientRect();
    // Box in canvas pixels.
    const bx0 = (b.left - cb.left) * sx;
    const bx1 = (b.right - cb.left) * sx;
    const by0 = (b.top - cb.top) * sy;
    const by1 = (b.bottom - cb.top) * sy;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let inside = 0;
    let outside = 0;
    let minX = 1e9,
      maxX = -1e9,
      minY = 1e9,
      maxY = -1e9;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (d[i] >= 160 || d[i + 1] >= 160) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) inside++;
        else outside++;
      }
    }
    return {
      inside,
      outside,
      total: inside + outside,
      inkBox: [minX, minY, maxX, maxY],
      box: [
        +bx0.toFixed(1),
        +by0.toFixed(1),
        +(bx1 - bx0).toFixed(1),
        +(by1 - by0).toFixed(1),
      ],
      canvas: [canvas.width, canvas.height],
    };
  }, testId);
}

test.describe("v2 editor - a rotated run's box follows its glyphs", () => {
  test("the box contains the rotated text's ink", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, ROTATED);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const n = await runs.count();
    expect(n, "fixture should hold at least one run").toBeGreaterThan(0);

    // The rotated run in this fixture is the one whose model matrix is rotated.
    const rotatedId = await page.evaluate(() => {
      const s = (
        window as unknown as {
          __v2_editor_store: {
            state: {
              pages: {
                runs: {
                  id: string;
                  text: string;
                  matrix: { a: number; b: number };
                }[];
              }[];
            };
          };
        }
      ).__v2_editor_store;
      for (const p of s.state.pages) {
        for (const r of p.runs) {
          const scale = Math.hypot(r.matrix.a, r.matrix.b);
          if (scale && Math.abs(r.matrix.b / scale) > 0.05) return r.id;
        }
      }
      return "";
    });
    if (!rotatedId) {
      test.skip(true, "fixture has no rotated run");
      return;
    }

    const cov = await coverage(page, `v2-run-${rotatedId}`);
    expect(cov, "no canvas reading").not.toBeNull();
    expect(cov!.total, "no ink found on the page at all").toBeGreaterThan(200);

    const pct = (cov!.inside / cov!.total) * 100;
    // eslint-disable-next-line no-console
    console.log(
      `ROTCOV inside=${cov!.inside} outside=${cov!.outside} pct=${pct.toFixed(1)} box=${JSON.stringify(cov!.box)} ink=${JSON.stringify(cov!.inkBox)}`,
    );

    // The box was axis-aligned over rotated glyphs and covered ~38% of them.
    expect(
      pct,
      `the run's box covers only ${pct.toFixed(1)}% of the page's ink (box=${JSON.stringify(cov!.box)}, ink=${JSON.stringify(cov!.inkBox)})`,
    ).toBeGreaterThan(85);
  });

  test("the box stays on the page for a rotated page", async ({ page }) => {
    test.setTimeout(120_000);
    const ROT_PAGES = path.join(
      import.meta.dirname,
      "../test-fixtures/rotated-pages.pdf",
    );
    await open(page, ROT_PAGES);
    const offenders = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        '[data-testid^="v2-run-p"]',
      )) {
        const canvas = el
          .closest("[data-testid^='v2-page-']")
          ?.querySelector("canvas") as HTMLCanvasElement | null;
        if (!canvas) continue;
        const cb = canvas.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        // A box may not hang off its own page by more than a hair.
        const overRight = b.right - cb.right;
        const overTop = cb.top - b.top;
        if (overRight > 8 || overTop > 8) {
          out.push(
            `${el.getAttribute("data-testid")} overRight=${overRight.toFixed(1)} overTop=${overTop.toFixed(1)}`,
          );
        }
      }
      return out;
    });
    // eslint-disable-next-line no-console
    console.log(`ROTPAGE offenders=${JSON.stringify(offenders)}`);
    expect(
      offenders,
      `run boxes hang off their own page on a /Rotate page: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
