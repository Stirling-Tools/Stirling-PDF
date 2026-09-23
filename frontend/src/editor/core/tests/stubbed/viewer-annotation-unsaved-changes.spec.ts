import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function loadViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  await page.waitForTimeout(2_000);
  return firstPage;
}

async function highlightSomeText(
  page: import("@playwright/test").Page,
  firstPage: import("@playwright/test").Locator,
) {
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();

  const highlight = page.getByRole("button", { name: "Highlight" }).first();
  await expect(highlight).toBeVisible({ timeout: 5_000 });
  await highlight.click();
  await page.waitForTimeout(1_000);
}

/** Form Editor goes through the tool switch guard, unlike plain tool-panel nav. */
async function switchToFormEditor(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Form Editor" }).first().click();
  await page.waitForTimeout(700);
}

function viewerCursor(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const pageEl = document.querySelector<HTMLElement>('[data-page-index="0"]');
    return pageEl?.parentElement
      ? getComputedStyle(pageEl.parentElement).cursor
      : null;
  });
}

test("highlighting text arms the unsaved-changes warning", async ({ page }) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);
  await highlightSomeText(page, firstPage);
  await switchToFormEditor(page);
  await expect(page.getByText("Unsaved changes").first()).toBeVisible({
    timeout: 5_000,
  });
});

test("undoing the only annotation disarms the unsaved-changes warning", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);
  await highlightSomeText(page, firstPage);

  const undo = page.getByRole("button", { name: "Undo" }).first();
  await expect(undo).toBeEnabled({ timeout: 5_000 });
  await undo.click();
  await page.waitForTimeout(1_000);

  await switchToFormEditor(page);
  await expect(page.getByText("Unsaved changes").first()).not.toBeVisible();
});

test("entering manual redact mode keeps annotation work saveable", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);
  await highlightSomeText(page, firstPage);

  // Back to the picker first: switching tools while still on Annotate would
  // trip the unsaved-changes guard.
  await page.getByRole("button", { name: "Back to all tools" }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("link", { name: "Redact" }).first().click();
  await page.waitForTimeout(700);
  await page.getByText("Manual", { exact: true }).first().click();

  await expect
    .poll(() => viewerCursor(page), { timeout: 15_000 })
    .toBe("crosshair");

  // Manual redaction mode used to clear the shared dirty flag, disabling this
  // button while the annotation history was still unsaved.
  await expect(
    page.getByRole("button", { name: "Save Changes" }).first(),
  ).toBeEnabled({ timeout: 10_000 });
});
