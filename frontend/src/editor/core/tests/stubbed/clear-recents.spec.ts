import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

/** Stubbed coverage for the sidebar's Clear recents confirm flow. */

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE = path.join(FIXTURES, "sample.pdf");
const OTHER = path.join(FIXTURES, "compare_sample_a.pdf");

const rows = (page: Page) => page.locator(".file-sidebar-file-item");
const dialog = (page: Page) => page.getByRole("dialog");

async function openClearDialog(page: Page): Promise<void> {
  await page
    .locator(".file-sidebar-group-header-row", { hasText: "Recent" })
    .hover();
  await page.getByTestId("file-sidebar-clear-library").click();
  await expect(dialog(page)).toBeVisible();
}

async function confirmClear(page: Page): Promise<void> {
  await page.getByTestId("file-sidebar-clear-library-confirm").click();
}

test("a failed storage delete shows the error and clears nothing", async ({
  page,
}) => {
  await uploadFiles(page, SAMPLE);
  await openClearDialog(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.delete = function (this: IDBObjectStore) {
      this.transaction.abort();
      return {} as IDBRequest;
    };
  });
  await confirmClear(page);

  await expect(dialog(page)).toContainText("Could not clear. Try again.");
  await page.keyboard.press("Escape");
  await expect(rows(page)).toHaveCount(1);
  await page.reload();
  await expect(rows(page)).toHaveCount(1, { timeout: 10_000 });
});

test("files added while the dialog is open are not cleared", async ({
  page,
}) => {
  await uploadFiles(page, SAMPLE);
  await openClearDialog(page);
  await expect(dialog(page)).toContainText("Clear 1 file from recents?");

  await page.locator('[data-testid="file-input"]').setInputFiles(OTHER);
  await expect(rows(page)).toHaveCount(2);
  await confirmClear(page);

  await expect(dialog(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("compare_sample_a.pdf");
});

test("unsaved changes prompt on confirm, and Keep Working clears nothing", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  // A highlight is the cheapest way to leave the viewer with unsaved changes.
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Highlight" }).first().click();

  await openClearDialog(page);
  await expect(page.getByRole("button", { name: "Keep Working" })).toHaveCount(
    0,
  );

  await confirmClear(page);
  await page.getByRole("button", { name: "Keep Working" }).click();
  await expect(dialog(page)).toContainText("Clear 1 file from recents?");
  await expect(rows(page)).toHaveCount(1);

  await confirmClear(page);
  await page.getByRole("button", { name: "Discard & Leave" }).click();
  await expect(rows(page)).toHaveCount(0);
});
