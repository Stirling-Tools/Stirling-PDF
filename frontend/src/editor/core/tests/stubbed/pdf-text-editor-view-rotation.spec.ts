import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { fileRows } from "@editor/tests/helpers/pdf-text-editor";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const OTHER_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
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
  await page
    .locator('[data-testid="file-input"], [data-testid="landing-file-input"]')
    .first()
    .setInputFiles(SAMPLE_PDF);
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

test("a view rotation is not carried onto another document", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/editor");
  await page
    .locator('[data-testid="file-input"], [data-testid="landing-file-input"]')
    .first()
    .setInputFiles([SAMPLE_PDF, OTHER_PDF]);
  const rows = page.locator(".file-sidebar-file-item");
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  const view = async (name: string) => {
    const row = fileRows(page, name).first();
    await row.hover();
    await row.locator(".file-sidebar-eye-btn").click();
  };
  await view("sample.pdf");
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Rotate Right" }).first().click();
  await expect.poll(() => firstPageLandscape(page)).toBe(true);

  await page
    .getByRole("link", { name: "PDF Text Editor", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await view("many-pages-sample.pdf");
  // many-pages-sample.pdf is the eight-page one.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __editor_store?: { getState(): { pageCount: number } };
              }
            ).__editor_store?.getState().pageCount,
        ),
      { timeout: 30_000 },
    )
    .toBe(8);

  await page.getByRole("button", { name: "Back to all tools" }).click();
  await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
  // A fixed wait, not a poll: the page is upright at first either way, and the
  // failure is a held rotation restored onto it a moment later.
  await page.waitForTimeout(1_000);
  expect(await firstPageLandscape(page)).toBe(false);
});
