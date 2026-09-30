import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { COLOUR_PICKER_RENDER_LABEL } from "@app/constants/renderLabels";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const ANNOTATED_PDF = path.join(FIXTURES, "annotations_out_of_order.pdf");

async function readRenderCounts(
  page: import("@playwright/test").Page,
): Promise<Record<string, number>> {
  return page.evaluate(
    () =>
      (window as unknown as { __renderCounts?: Record<string, number> })
        .__renderCounts ?? {},
  );
}

async function openEditorWithAnnotationA(
  page: import("@playwright/test").Page,
) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(ANNOTATED_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  await page.waitForTimeout(2_500);

  // Annotation A on page 1, rect [100,686,116,708] on 612x792.
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  await page.mouse.click(
    box.x + box.width * ((100 + 116) / 2 / 612),
    box.y + box.height * ((792 - (686 + 708) / 2) / 792),
  );
  const menu = page.locator("[data-annotation-selection-menu]").first();
  await expect(menu).toBeVisible({ timeout: 10_000 });
  return menu;
}

test("changing colour from the reader UI does not flicker the open palette", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const menu = await openEditorWithAnnotationA(page);

  // The whole point of this PR: with the Annotate panel closed, a committed
  // edit surfaces it so the save action is visible.
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    0,
  );

  await menu
    .getByRole("button", { name: /Colou?r|style/i })
    .first()
    .click();
  const swatch = page.locator(".mantine-ColorPicker-swatch").nth(2);
  await expect(swatch).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);

  const before = (await readRenderCounts(page))[COLOUR_PICKER_RENDER_LABEL];

  await swatch.click();
  // Opening the Annotate panel re-lays out the viewer, which re-renders the
  // menu many times. Mantine memoises nothing inside ColorPicker, so each of
  // those rebuilt every swatch and the open palette visibly flickered. The
  // palette must now rebuild only for the colour change itself.
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    1,
    {
      timeout: 10_000,
    },
  );
  await page.waitForTimeout(1_200);

  const after = (await readRenderCounts(page))[COLOUR_PICKER_RENDER_LABEL];
  expect(before).toBeGreaterThan(0);
  expect(after - before).toBeLessThanOrEqual(3);
});

test("the Annotate panel is opened at most once per edit session", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const menu = await openEditorWithAnnotationA(page);

  await menu
    .getByRole("button", { name: /Colou?r|style/i })
    .first()
    .click();
  const swatch = page.locator(".mantine-ColorPicker-swatch").nth(2);
  await expect(swatch).toBeVisible({ timeout: 10_000 });
  await swatch.click();
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    1,
    {
      timeout: 10_000,
    },
  );

  // Scrolling keeps producing committed annotation events as the page settles.
  // Each one used to re-select the Annotate tool, rebuilding the panel.
  const before = (await readRenderCounts(page))[COLOUR_PICKER_RENDER_LABEL];
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 140);
    await page.waitForTimeout(120);
  }
  const after = (await readRenderCounts(page))[COLOUR_PICKER_RENDER_LABEL];

  expect(after - before).toBeLessThanOrEqual(3);
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    1,
  );
});
