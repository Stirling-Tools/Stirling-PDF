import fs from "node:fs";
import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES, "sample.pdf");

async function annotationCounts(
  page: import("@playwright/test").Page,
  label: string,
) {
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await page
    .getByRole("button", { name: /download|export/i })
    .first()
    .click();
  const download = await downloadPromise;
  const target = path.join("/tmp", `stirling-delete-${label}.pdf`);
  await download.saveAs(target);
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const exported = await PDFDocument.load(fs.readFileSync(target));
  await page.waitForTimeout(600);
  return exported.getPages().map((entry) => entry.node.Annots()?.size() ?? 0);
}

async function createHighlight(page: import("@playwright/test").Page) {
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
}

test("a deleted annotation is not in the exported PDF", async ({ page }) => {
  test.setTimeout(180_000);
  await createHighlight(page);

  const menu = page.locator("[data-annotation-selection-menu]").first();
  await expect(menu).toBeVisible({ timeout: 10_000 });
  await menu.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.locator("[data-annotation-deleted-menu]").first(),
  ).toBeVisible({ timeout: 10_000 });

  const counts = await annotationCounts(page, "deleted");
  expect(counts.every((count) => count === 0)).toBe(true);
});

test("a save after a delete keeps the deletion", async ({ page }) => {
  test.setTimeout(180_000);
  await createHighlight(page);

  const menu = page.locator("[data-annotation-selection-menu]").first();
  await expect(menu).toBeVisible({ timeout: 10_000 });
  await menu.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.locator("[data-annotation-deleted-menu]").first(),
  ).toBeVisible({ timeout: 10_000 });

  const save = page.getByRole("button", { name: "Save Changes" }).first();
  await expect(save).toBeEnabled({ timeout: 15_000 });
  await save.click();
  await expect(save).toBeDisabled({ timeout: 20_000 });

  const counts = await annotationCounts(page, "deleted-then-saved");
  expect(counts.every((count) => count === 0)).toBe(true);
});
