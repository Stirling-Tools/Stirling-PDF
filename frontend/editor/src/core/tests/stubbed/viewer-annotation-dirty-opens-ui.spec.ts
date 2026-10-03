import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const ANNOTATED_PDF = path.join(FIXTURES, "annotations_out_of_order.pdf");

async function loadAnnotatedViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(ANNOTATED_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  await page.waitForTimeout(2_500);
  return firstPage;
}

/** Annotation A on page 1 of the fixture, rect [100,686,116,708] on 612x792. */
async function selectAnnotationA(page: import("@playwright/test").Page) {
  const firstPage = page.locator('[data-page-index="0"]').first();
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  const x = box.x + box.width * ((100 + 116) / 2 / 612);
  const y = box.y + box.height * ((792 - (686 + 708) / 2) / 792);
  await page.mouse.click(x, y);
  await expect(
    page.locator("[data-annotation-selection-menu]").first(),
  ).toBeVisible({ timeout: 10_000 });
}

async function changeSelectedAnnotationColor(
  page: import("@playwright/test").Page,
) {
  const menu = page.locator("[data-annotation-selection-menu]").first();
  await menu
    .getByRole("button", { name: /Colou?r|style/i })
    .first()
    .click();
  const swatch = page.locator(".mantine-ColorPicker-swatch").nth(2);
  await expect(swatch).toBeVisible({ timeout: 5_000 });
  await swatch.click();
  await page.waitForTimeout(1_000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

function saveChangesButton(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Save Changes" }).first();
}

test("editing a pre-existing annotation opens the Annotate UI", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadAnnotatedViewer(page);

  // Nothing is dirty yet, so the panel is closed and has no save action.
  await expect(saveChangesButton(page)).toHaveCount(0);

  await selectAnnotationA(page);
  await changeSelectedAnnotationColor(page);

  // The edit was made from the viewer; the annotation UI must appear so its
  // Save Changes button is visible and enabled instead of the change reading
  // as autosaved.
  const save = saveChangesButton(page);
  await expect(save).toBeVisible({ timeout: 10_000 });
  await expect(save).toBeEnabled();
});

test("deleting a pre-existing annotation opens the Annotate UI", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadAnnotatedViewer(page);

  await selectAnnotationA(page);
  await page
    .locator("[data-annotation-selection-menu]")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(
    page.locator("[data-annotation-deleted-menu]").first(),
  ).toBeVisible({ timeout: 10_000 });
  const save = saveChangesButton(page);
  await expect(save).toBeVisible({ timeout: 10_000 });
  await expect(save).toBeEnabled();
});

test("saving from the auto-opened Annotate UI clears the dirty state", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const firstPage = await loadAnnotatedViewer(page);

  await selectAnnotationA(page);
  await changeSelectedAnnotationColor(page);

  const save = saveChangesButton(page);
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect(save).toBeDisabled({ timeout: 20_000 });

  // The save also survives the view: leaving the viewer must not warn about
  // work that was already persisted.
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  await page.mouse.click(box.x + 16, box.y + box.height - 16);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Form Editor" }).first().click();
  await expect(page.getByText("Unsaved changes").first()).not.toBeVisible({
    timeout: 5_000,
  });
});

test("the Annotate UI comes back after leaving it and editing again", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadAnnotatedViewer(page);

  await selectAnnotationA(page);
  await changeSelectedAnnotationColor(page);
  await expect(saveChangesButton(page)).toBeVisible({ timeout: 10_000 });

  // Leave the Annotate tool without saving.
  await page.getByRole("button", { name: "Reader" }).first().click();
  await expect(saveChangesButton(page)).toHaveCount(0, { timeout: 10_000 });

  // Editing again must surface the panel once more. Keying this off the dirty
  // flag rather than the edit revision meant it only ever fired for the first
  // edit, because the flag stays set after leaving.
  await selectAnnotationA(page);
  await changeSelectedAnnotationColor(page);

  await expect(saveChangesButton(page)).toBeVisible({ timeout: 10_000 });
  await expect(saveChangesButton(page)).toBeEnabled();
});
