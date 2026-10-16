import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES, "sample.pdf");

async function loadViewerWithHighlight(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_000);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();

  const highlight = page
    .locator('[data-text-selection-menu] button[aria-label="Highlight"]')
    .first();
  await expect(highlight).toBeVisible({ timeout: 5_000 });
  await highlight.click();
  await page.waitForTimeout(1_500);
  return firstPage;
}

test("changing a colour keeps the annotation menu open", async ({ page }) => {
  test.setTimeout(180_000);
  await loadViewerWithHighlight(page);

  const menu = page.locator("[data-annotation-selection-menu]").first();
  await expect(menu).toBeVisible({ timeout: 10_000 });

  await page
    .getByRole("button", { name: /^Change Colou?r$/ })
    .first()
    .click();
  await page.locator(".mantine-ColorPicker-swatch").nth(2).click();

  await expect(menu).toBeVisible({ timeout: 10_000 });
  await expect(menu.getByRole("button", { name: "Delete" })).toBeVisible();
});

test("deleting an annotation leaves an undo menu that restores it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadViewerWithHighlight(page);

  const menu = page.locator("[data-annotation-selection-menu]").first();
  const deletedMenu = page.locator("[data-annotation-deleted-menu]").first();
  await expect(menu).toBeVisible({ timeout: 10_000 });
  await expect(deletedMenu).not.toBeVisible();

  await menu.getByRole("button", { name: "Delete" }).click();

  // The annotation is gone, so its selection menu gives way to the undo menu
  // anchored where the annotation was.
  await expect(menu).not.toBeVisible({ timeout: 10_000 });
  await expect(deletedMenu).toBeVisible({ timeout: 10_000 });
  await expect(deletedMenu).toContainText(/Annotation deleted/i);

  await deletedMenu.getByRole("button", { name: "Undo" }).click();

  // Undo restores the annotation and hands the anchor back to the normal menu.
  await expect(menu).toBeVisible({ timeout: 10_000 });
  await expect(deletedMenu).not.toBeVisible();
  await expect(menu.getByRole("button", { name: "Delete" })).toBeVisible();
});

test("dismissing the undo menu leaves the selection menu closed", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const firstPage = await loadViewerWithHighlight(page);

  const menu = page.locator("[data-annotation-selection-menu]").first();
  const deletedMenu = page.locator("[data-annotation-deleted-menu]").first();
  await menu.getByRole("button", { name: "Delete" }).click();
  await expect(deletedMenu).toBeVisible({ timeout: 10_000 });

  // Clicking away dismisses the undo menu without reopening the selection
  // menu, so a dismissed delete reads as a plain delete.
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  await page.mouse.click(box.x + 16, box.y + box.height - 16);
  await expect(deletedMenu).not.toBeVisible({ timeout: 5_000 });
  await expect(menu).not.toBeVisible();

  // The delete is still recoverable from the toolbar Undo.
  await expect(page.getByRole("button", { name: "Undo" }).first()).toBeEnabled({
    timeout: 10_000,
  });
});

test("editing a comment from the sidebar reopens its menu", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const firstPage = await loadViewerWithHighlight(page);

  const menu = page.locator("[data-annotation-selection-menu]").first();
  await menu.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator(".comments-sidebar").first()).toBeVisible({
    timeout: 10_000,
  });

  // Deselect so the sidebar edit is the only thing dirtying the annotation.
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  await page.mouse.click(box.x + 16, box.y + box.height - 16);
  await expect(menu).not.toBeVisible({ timeout: 10_000 });

  // The sidebar header has its own "More actions" menu; the comment row's one
  // is the second button carrying that label.
  await page.getByRole("button", { name: "More actions" }).nth(1).click();
  await page.getByRole("menuitem", { name: /Edit/ }).click();
  const draft = page.locator(".comments-sidebar textarea").first();
  await draft.fill("Updated from the sidebar");
  await draft.press("Enter");

  // A committed update opens the menu for the annotation that changed.
  await expect(menu).toBeVisible({ timeout: 10_000 });
});
