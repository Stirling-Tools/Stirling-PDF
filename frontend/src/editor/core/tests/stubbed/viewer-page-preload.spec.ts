import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const MANY_PAGES_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
);

test("pre-renders a preview for pages buffered outside the viewport", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/editor");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(MANY_PAGES_PDF);

  // Page index 2 is below the fold; its preview proves buffering.
  const bufferedPage = page.locator('[data-page-index="2"]');
  await expect(bufferedPage).toBeAttached({ timeout: 30_000 });

  const preview = bufferedPage.locator("img.pdf-page-preview");
  await expect(preview).toBeAttached({ timeout: 30_000 });
  await expect
    .poll(async () =>
      preview.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);

  const box = await bufferedPage.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y >= viewport.height).toBe(true);

  const naturalWidth = await preview.evaluate(
    (el) => (el as HTMLImageElement).naturalWidth,
  );
  expect(naturalWidth).toBeLessThanOrEqual(1024);
  expect(await preview.getAttribute("src")).toMatch(/^blob:/);
});
