import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const ANNOTATED_PDF = path.join(FIXTURES, "annotations_out_of_order.pdf");

/**
 * These specs assert what the user sees, not render counts. The palette's render
 * budget lives in the `annotationMenuSliders` unit test, which runs against the
 * dev bundle; `useRenderCount` is dead-code-eliminated in the production build CI
 * serves, so a render count read here would be undefined rather than a number.
 */
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

/** The save action on the persistent surface, scoped away from the panel's own. */
function saveSurface(page: import("@playwright/test").Page) {
  return page.locator("[data-annotation-save-surface]");
}

function panelSaveButton(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Save Changes" }).filter({
    hasNot: page.locator(
      "xpath=ancestor-or-self::*[@data-annotation-save-surface]",
    ),
  });
}

async function changeColour(page: import("@playwright/test").Page) {
  const menu = page.locator("[data-annotation-selection-menu]").first();
  await menu
    .getByRole("button", { name: /Colou?r|style/i })
    .first()
    .click();
  const swatch = page.locator(".mantine-ColorPicker-swatch").nth(2);
  await expect(swatch).toBeVisible({ timeout: 10_000 });
  await swatch.click();
  await expect(swatch).toBeVisible({ timeout: 10_000 });
}

test("changing colour keeps the palette open and never opens the Annotate panel", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditorWithAnnotationA(page);
  await expect(saveSurface(page)).toHaveCount(0);

  await changeColour(page);

  // The save action appears on the persistent surface...
  await expect(saveSurface(page)).toHaveCount(1, { timeout: 10_000 });
  await expect(saveSurface(page)).toBeVisible();
  await expect(
    saveSurface(page).getByRole("button", { name: "Save Changes" }),
  ).toBeEnabled();

  // ...and the palette is still open, because surfacing the save action must not
  // navigate. Force-selecting the Annotate tool used to close this popover and
  // rebuild it, which is the flicker this guards.
  await expect(
    page.locator(".mantine-ColorPicker-swatch").nth(2),
  ).toBeVisible();
  await expect(panelSaveButton(page)).toHaveCount(0);
});

test("scrolling keeps one save surface and an open palette", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditorWithAnnotationA(page);
  await changeColour(page);
  await expect(saveSurface(page)).toHaveCount(1);

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 140);
    await page.waitForTimeout(120);
  }

  // Scrolling must not add, drop, or duplicate the surface, and must not tear
  // down the open palette.
  await expect(saveSurface(page)).toHaveCount(1);
  await expect(
    saveSurface(page).getByRole("button", { name: "Save Changes" }),
  ).toBeVisible();
  await expect(
    page.locator(".mantine-ColorPicker-swatch").nth(2),
  ).toBeVisible();
});

test("saving from the surface closes it and leaves the palette alone", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditorWithAnnotationA(page);
  await changeColour(page);

  await saveSurface(page)
    .getByRole("button", { name: "Save Changes" })
    .first()
    .click();

  // A save that covered the edit clears the surface; the viewer stays put.
  await expect(saveSurface(page)).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
});
