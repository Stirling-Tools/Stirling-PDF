import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const MULTIPAGE_PDF = path.join(FIXTURES, "annotations_out_of_order.pdf");

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      get: () => 10,
      configurable: true,
    });
  });
});

async function loadViewer(page: import("@playwright/test").Page, pages = 3) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(MULTIPAGE_PDF);

  // Narrow viewports put the viewer behind the Workspace tab.
  const workspaceTab = page.getByRole("tab", { name: "Workspace" });
  if (await workspaceTab.isVisible().catch(() => false)) {
    await workspaceTab.click();
  }

  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBe(pages);
  await page.waitForTimeout(2_000);
  return firstPage;
}

test("phone: a save keeps the live document and the page in place", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loadViewer(page);

  if (
    await page.getByRole("button", { name: "Next Page" }).first().isVisible()
  ) {
    await page.getByRole("button", { name: "Next Page" }).first().click();
    await page.waitForTimeout(600);
  }
  const pageTopBefore = await page
    .locator('[data-page-index="1"]')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().top));

  // Tag the page nodes: a save must keep the live document on a phone too.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-page-index]")) {
      el.setAttribute("data-phone-page-probe", "1");
    }
  });
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(2_500);

  expect(
    await page.evaluate(
      () =>
        document.querySelectorAll('[data-phone-page-probe="1"]').length ===
        document.querySelectorAll("[data-page-index]").length,
    ),
  ).toBe(true);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 15_000 })
    .toBe(3);
  await expect
    .poll(
      async () =>
        Math.abs(
          pageTopBefore -
            (await page
              .locator('[data-page-index="1"]')
              .first()
              .evaluate((el) => Math.round(el.getBoundingClientRect().top))),
        ) <= 3,
      { timeout: 15_000 },
    )
    .toBe(true);
});

test("phone: rotating the viewport keeps the document and does not crash", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    const message = String(error);
    // WebKit surfaces the benign ResizeObserver-loop warning as a page error;
    // reproduced on a clean upstream checkout, so only real errors fail here.
    if (/ResizeObserver loop (completed|limit exceeded)/.test(message)) return;
    errors.push(message);
  });
  await loadViewer(page);
  await page.getByRole("button", { name: "Next Page" }).first().click();
  await page.waitForTimeout(600);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1_500);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 15_000 })
    .toBe(3);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1_500);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 15_000 })
    .toBe(3);

  expect(errors).toEqual([]);
});
