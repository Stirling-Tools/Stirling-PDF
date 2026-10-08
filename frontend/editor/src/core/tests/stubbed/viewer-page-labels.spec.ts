import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

// 6 pages: /PageLabels makes the first three roman (i, ii, iii) and the rest
// arabic from 1, so index and label disagree from page 4 on.
const LABELLED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/page-labels-sample.pdf",
);

async function loadViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(LABELLED_PDF);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  return page.locator(".pdf-viewer-toolbar input").first();
}

// The page nearest the top of the viewport, which is what scrolling targets.
async function topPageIndex(page: import("@playwright/test").Page) {
  return page.locator("[data-page-index]").evaluateAll(
    (elements) =>
      elements
        .map((element) => ({
          index: Number(element.getAttribute("data-page-index")),
          top: element.getBoundingClientRect().top,
        }))
        .filter(
          (entry) => entry.top > -5 && entry.top < window.innerHeight * 0.5,
        )
        .sort((a, b) => a.top - b.top)
        .at(0)?.index ?? -1,
  );
}

test("the toolbar shows the document's page labels, not page indices", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageField = await loadViewer(page);

  await expect(pageField).toHaveValue("i");

  await page
    .locator(".pdf-viewer-toolbar")
    .getByLabel("Next Page")
    .first()
    .click();

  await expect(pageField).toHaveValue("ii");
  await expect.poll(() => topPageIndex(page)).toBe(1);
});

test("typing a page label navigates to that page", async ({ page }) => {
  test.setTimeout(120_000);
  const pageField = await loadViewer(page);

  await pageField.fill("iii");
  await pageField.press("Enter");

  await expect(pageField).toHaveValue("iii");
  await expect.poll(() => topPageIndex(page)).toBe(2);
});

test("a plain number still navigates by index", async ({ page }) => {
  test.setTimeout(120_000);
  const pageField = await loadViewer(page);

  await pageField.fill("5");
  await pageField.press("Enter");

  // Page 5 carries the label "2".
  await expect(pageField).toHaveValue("2");
  await expect.poll(() => topPageIndex(page)).toBe(4);
});
