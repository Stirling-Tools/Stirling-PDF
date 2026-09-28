import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const LINK_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/link-annotations-sample.pdf",
);
const LINKS_PER_PAGE = 4;

async function loadViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(LINK_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  return firstPage;
}

test("link annotations render as overlays with no annotation-layer hit boxes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);

  await expect(firstPage.locator(".pdf-link-overlay")).toHaveCount(
    LINKS_PER_PAGE,
    { timeout: 15_000 },
  );

  // Each link keeps exactly one annotation-layer SVG for its underline or
  // border styling; LinkLayer owns the clickable overlay, so no SVG may carry
  // a transparent hit rect.
  await expect(firstPage.locator("svg")).toHaveCount(LINKS_PER_PAGE);
  await expect(firstPage.locator("svg rect:not([stroke])")).toHaveCount(0);
});

test("hovering a link overlay still opens the link toolbar", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);

  const overlay = firstPage.locator(".pdf-link-overlay").first();
  await expect(overlay).toBeAttached({ timeout: 15_000 });
  await overlay.hover();

  const toolbar = page.locator(".pdf-link-toolbar").first();
  await expect(toolbar).toBeVisible({ timeout: 5_000 });
  await expect(toolbar.locator(".pdf-link-toolbar-btn--delete")).toBeVisible();
  await expect(toolbar.locator(".pdf-link-toolbar-btn--go")).toBeVisible();
});
