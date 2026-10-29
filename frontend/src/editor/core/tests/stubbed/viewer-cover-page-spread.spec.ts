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

/** Groups page indices by the row they render on, top to bottom. */
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

test.describe("viewer cover page spread", () => {
  test("shows page 1 alone, pairs 2-3, and keeps the choice across single page", async ({
    page,
  }) => {
    await loadViewer(page);

    await page.getByRole("button", { name: "Dual Page View" }).click();
    await expect.poll(() => spreadRows(page)).toEqual([[0, 1], [2]]);

    const cover = page.getByRole("button", {
      name: "Show Cover Page Separately",
    });
    await cover.click();
    await expect(cover).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => spreadRows(page)).toEqual([[0], [1, 2]]);

    await page.getByRole("button", { name: "Single Page View" }).click();
    await expect.poll(() => spreadRows(page)).toEqual([[0], [1], [2]]);

    await page.getByRole("button", { name: "Dual Page View" }).click();
    await expect.poll(() => spreadRows(page)).toEqual([[0], [1, 2]]);
  });
});
