import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

/**
 * Regression cover for the v2 editor's near-viewport bitmap prefetch.
 *
 * PageView keeps a page's PDFium bitmap only while the page is "near" the
 * viewport, and frees the canvas otherwise (a 4x-zoom A4 canvas is ~32MB).
 * The observer that decides "near" uses rootMargin: 800px, but the pages live
 * inside a Mantine ScrollArea. IntersectionObserver clips the target against
 * every scrolling ancestor BEFORE root+rootMargin is applied, so with the
 * default (document) root a page one pixel outside the ScrollArea is already
 * non-intersecting and the margin can never bring it back - the prefetch was
 * dead code and pages popped in as blank placeholders on scroll.
 *
 * These tests measure it from geometry + canvas backing stores only:
 *   - a page whose top edge is inside the 800px margin must be rendered
 *   - a page well outside it must still be freed (memory behaviour)
 */

const MANY_PAGES_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
);

type Page = import("@playwright/test").Page;

interface PageGeom {
  index: number;
  /** Canvas backing-store width; 0 means the bitmap was freed. */
  canvasW: number;
  placeholder: boolean;
  /** px from the scroll viewport's bottom edge down to the page's top edge. */
  gapBelow: number;
  /** px from the page's bottom edge up to the scroll viewport's top edge. */
  gapAbove: number;
}

/** Geometry + bitmap state of every mounted page, relative to the ScrollArea. */
function scanPages(p: Page): Promise<{ vpH: number; pages: PageGeom[] }> {
  return p.evaluate(() => {
    const vp = document.querySelector<HTMLElement>(
      '[data-testid="v2-stage"] .mantine-ScrollArea-viewport',
    );
    if (!vp) throw new Error("ScrollArea viewport not found");
    const vr = vp.getBoundingClientRect();
    const pages = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid^='v2-page-']"),
    )
      .filter((el) => /^v2-page-\d+$/.test(el.dataset.testid ?? ""))
      .map((el) => {
        const idx = Number((el.dataset.testid ?? "").replace("v2-page-", ""));
        const r = el.getBoundingClientRect();
        const c = el.querySelector("canvas");
        return {
          index: idx,
          canvasW: c ? c.width : -1,
          placeholder: !!el.querySelector(
            `[data-testid="v2-page-${idx}-placeholder"]`,
          ),
          gapBelow: Math.round(r.top - vr.bottom),
          gapAbove: Math.round(vr.top - r.bottom),
        };
      });
    return { vpH: Math.round(vr.height), pages };
  });
}

function fmt(scan: { vpH: number; pages: PageGeom[] }) {
  return scan.pages
    .map(
      (g) =>
        `page ${g.index}: canvas.width=${g.canvasW} placeholder=${g.placeholder} gapBelow=${g.gapBelow} gapAbove=${g.gapAbove}`,
    )
    .join("\n");
}

/** Scroll so page `idx`'s top edge sits exactly `gap` px below the fold. */
async function parkGapBelow(p: Page, idx: number, gap: number) {
  await p.evaluate(
    ({ i, g }) => {
      const vp = document.querySelector<HTMLElement>(
        '[data-testid="v2-stage"] .mantine-ScrollArea-viewport',
      );
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-page-${i}"]`,
      );
      if (!vp || !el) throw new Error("stage or page missing");
      const current =
        el.getBoundingClientRect().top - vp.getBoundingClientRect().bottom;
      vp.scrollTop += current - g;
    },
    { i: idx, g: gap },
  );
}

async function openV2(p: Page, file: string) {
  await p.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(p.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await p.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(p.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await p.waitForTimeout(2500);
}

/**
 * Poll until the page geometry settles and every pending render has landed.
 * Renders are async and can take >1s on a loaded machine, so hold out for
 * three identical samples in a row rather than two.
 */
async function settledScan(p: Page) {
  let last = JSON.stringify(await scanPages(p));
  let stable = 0;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(500);
    const next = await scanPages(p);
    const key = JSON.stringify(next);
    stable = key === last ? stable + 1 : 0;
    last = key;
    if (stable >= 3) return next;
  }
  return JSON.parse(last) as { vpH: number; pages: PageGeom[] };
}

/** The prefetch margin PageView asks for. */
const MARGIN = 800;
/** Comfortably inside / outside the margin, to keep the test off the edge. */
const INSIDE = 700;
const OUTSIDE = 1000;

test.describe("v2 near-viewport prefetch", () => {
  test("a page inside the 800px prefetch margin is rendered, not a placeholder", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);
    const scan = await settledScan(page);
    console.log(`[at load] viewport height ${scan.vpH}\n${fmt(scan)}`);

    const inside = scan.pages.filter(
      (g) => g.gapBelow > 0 && g.gapBelow <= INSIDE,
    );
    expect(
      inside.length,
      `fixture must place at least one page 0..${INSIDE}px below the fold; got\n${fmt(scan)}`,
    ).toBeGreaterThan(0);

    for (const g of inside) {
      expect(
        g.canvasW,
        `page ${g.index} sits ${g.gapBelow}px below the fold (inside the ${MARGIN}px prefetch margin) so its bitmap must already be rendered\n${fmt(scan)}`,
      ).toBeGreaterThan(0);
      expect(
        g.placeholder,
        `page ${g.index} sits ${g.gapBelow}px below the fold and must not show the placeholder\n${fmt(scan)}`,
      ).toBe(false);
    }
  });

  test("pages far outside the margin are still freed", async ({ page }) => {
    await openV2(page, MANY_PAGES_PDF);
    const scan = await settledScan(page);
    console.log(`[memory guard] viewport height ${scan.vpH}\n${fmt(scan)}`);

    const far = scan.pages.filter((g) => g.gapBelow > OUTSIDE);
    expect(
      far.length,
      `fixture must place at least one page >${OUTSIDE}px below the fold; got\n${fmt(scan)}`,
    ).toBeGreaterThan(0);

    for (const g of far) {
      expect(
        g.canvasW,
        `page ${g.index} sits ${g.gapBelow}px below the fold (well outside the ${MARGIN}px margin) so its bitmap must stay freed\n${fmt(scan)}`,
      ).toBe(0);
    }
  });

  // Pages in this fixture are 1236px apart, so the at-load case only ever
  // exercises a 267px gap. Park one page at a chosen distance instead, which
  // pins the margin: dead at 900px below the fold, live at 700px.
  test("the prefetch margin is ~800px, measured by parking one page", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    await parkGapBelow(page, 3, OUTSIDE - 100);
    const outside = await settledScan(page);
    const far = outside.pages.find((g) => g.index === 3)!;
    console.log(`[page 3 parked ~900px below]\n${fmt(outside)}`);
    expect(far.gapBelow).toBeGreaterThan(MARGIN);
    expect(
      far.canvasW,
      `page 3 parked ${far.gapBelow}px below the fold is outside the ${MARGIN}px margin and must stay freed\n${fmt(outside)}`,
    ).toBe(0);

    await parkGapBelow(page, 3, INSIDE);
    const inside = await settledScan(page);
    const near = inside.pages.find((g) => g.index === 3)!;
    console.log(`[page 3 parked ~700px below]\n${fmt(inside)}`);
    expect(near.gapBelow).toBeLessThan(MARGIN);
    expect(near.gapBelow).toBeGreaterThan(0);
    expect(
      near.canvasW,
      `page 3 parked ${near.gapBelow}px below the fold is inside the ${MARGIN}px margin and must be rendered ahead of the scroll\n${fmt(inside)}`,
    ).toBeGreaterThan(0);
    expect(near.placeholder).toBe(false);
  });

  test("prefetch also covers pages just above the viewport", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);
    await page.evaluate(() => {
      document
        .querySelector<HTMLElement>('[data-testid="v2-page-4"]')
        ?.scrollIntoView({ block: "center" });
    });
    const scan = await settledScan(page);
    console.log(`[page 4 centred] viewport height ${scan.vpH}\n${fmt(scan)}`);

    const above = scan.pages.filter(
      (g) => g.gapAbove > 0 && g.gapAbove <= INSIDE,
    );
    expect(
      above.length,
      `expected a page 0..${INSIDE}px above the viewport; got\n${fmt(scan)}`,
    ).toBeGreaterThan(0);

    for (const g of above) {
      expect(
        g.canvasW,
        `page ${g.index} sits ${g.gapAbove}px above the viewport (inside the ${MARGIN}px prefetch margin) so its bitmap must still be live\n${fmt(scan)}`,
      ).toBeGreaterThan(0);
    }

    const far = scan.pages.filter(
      (g) => g.gapAbove > OUTSIDE || g.gapBelow > OUTSIDE,
    );
    expect(far.length).toBeGreaterThan(0);
    for (const g of far) {
      expect(
        g.canvasW,
        `page ${g.index} is far from the viewport (gapAbove=${g.gapAbove} gapBelow=${g.gapBelow}) so its bitmap must stay freed\n${fmt(scan)}`,
      ).toBe(0);
    }
  });
});
