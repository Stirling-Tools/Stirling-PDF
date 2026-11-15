import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

/** Whether the first viewer page is drawn wider than tall. */
async function firstPageLandscape(page: Page): Promise<boolean> {
  const box = await page.locator('[data-page-index="0"]').first().boundingBox();
  if (!box) throw new Error("first page not laid out");
  return box.width > box.height;
}

test("the view rotation returns when the text editor closes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  expect(await firstPageLandscape(page)).toBe(false);

  await page.getByRole("button", { name: "Rotate Right" }).first().click();
  await expect.poll(() => firstPageLandscape(page)).toBe(true);

  // Editing straightens the view.
  await page
    .getByRole("link", { name: "PDF Text Editor", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => firstPageLandscape(page)).toBe(false);

  await page.getByRole("button", { name: "Back to all tools" }).click();
  await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
  await expect.poll(() => firstPageLandscape(page)).toBe(true);
});
