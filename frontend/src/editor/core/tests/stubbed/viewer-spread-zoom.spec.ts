import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const THREE_PAGE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/annotations_out_of_order.pdf",
);

async function loadViewer(page: Page) {
  await page.goto("/editor");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(THREE_PAGE_PDF);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBe(3);
}

function firstPageWidth(page: Page) {
  return page
    .locator('[data-page-index="0"]')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().width));
}

function zoomPercent(page: Page): Promise<number> {
  return page
    .getByText(/%$/)
    .first()
    .textContent()
    .then((text) => Number.parseInt(text ?? "", 10));
}

function spreadRows(page: Page) {
  return page.evaluate(() => {
    const rows = new Map<number, number[]>();
    for (const el of document.querySelectorAll<HTMLElement>(
      "[data-page-index]",
    )) {
      const top = Math.round(el.getBoundingClientRect().top);
      const index = Number(el.dataset.pageIndex);
      rows.set(top, [...(rows.get(top) ?? []), index]);
    }
    return [...rows.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, indices]) => indices.sort((a, b) => a - b));
  });
}

/** Whether every rendered page sits inside the viewer's scroll viewport. */
function spreadFitsViewport(page: Page) {
  return page.evaluate(() => {
    const pages = [
      ...document.querySelectorAll<HTMLElement>("[data-page-index]"),
    ];
    const first = pages[0];
    if (!first) return false;

    let viewport: HTMLElement | null = first.parentElement;
    while (
      viewport &&
      !/auto|scroll/.test(getComputedStyle(viewport).overflowY)
    ) {
      viewport = viewport.parentElement;
    }
    if (!viewport) return false;

    const rects = pages.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const viewportWidth = viewport.getBoundingClientRect().width;
    return right - left <= viewportWidth + 2;
  });
}

test("auto zoom refits when dual page view turns on and off", async ({
  page,
}) => {
  await loadViewer(page);
  const singleWidth = await firstPageWidth(page);
  const singleZoom = await zoomPercent(page);

  await page.getByRole("button", { name: "Dual Page View" }).click();
  await expect.poll(() => spreadRows(page)).toEqual([[0, 1], [2]]);

  await expect
    .poll(() => firstPageWidth(page), { timeout: 5_000 })
    .toBeLessThan(singleWidth * 0.9);
  await expect
    .poll(() => spreadFitsViewport(page), { timeout: 5_000 })
    .toBe(true);
  await expect.poll(() => zoomPercent(page)).not.toBe(singleZoom);
  const dualWidth = await firstPageWidth(page);

  await page.getByRole("button", { name: "Single Page View" }).click();
  await expect.poll(() => spreadRows(page)).toEqual([[0], [1], [2]]);

  await expect
    .poll(() => firstPageWidth(page), { timeout: 5_000 })
    .toBeGreaterThan(dualWidth * 1.15);
  await expect
    .poll(() => spreadFitsViewport(page), { timeout: 5_000 })
    .toBe(true);
  await expect
    .poll(async () => Math.abs((await zoomPercent(page)) - singleZoom))
    .toBeLessThanOrEqual(1);
});

test("explicit fit width stays fitted when dual page view turns on and off", async ({
  page,
}) => {
  await loadViewer(page);
  await page.getByRole("button", { name: "Fit to width" }).click();

  const fitButton = page.getByRole("button", { name: "Fit to width" });
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");
  const singleWidth = await firstPageWidth(page);

  await page.getByRole("button", { name: "Dual Page View" }).click();
  await expect.poll(() => spreadRows(page)).toEqual([[0, 1], [2]]);

  await expect
    .poll(() => firstPageWidth(page), { timeout: 5_000 })
    .toBeLessThan(singleWidth * 0.75);
  await expect
    .poll(() => spreadFitsViewport(page), { timeout: 5_000 })
    .toBe(true);
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");
  const dualWidth = await firstPageWidth(page);

  await page.getByRole("button", { name: "Single Page View" }).click();
  await expect.poll(() => spreadRows(page)).toEqual([[0], [1], [2]]);

  await expect
    .poll(() => firstPageWidth(page), { timeout: 5_000 })
    .toBeGreaterThan(dualWidth * 1.5);
  await expect
    .poll(() => spreadFitsViewport(page), { timeout: 5_000 })
    .toBe(true);
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");
});
