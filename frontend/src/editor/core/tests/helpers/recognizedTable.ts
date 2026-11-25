import type { Page } from "@playwright/test";

/** Hovers the first recognized table, which is what reveals its chip, and clicks "Edit table". */
export async function editRecognizedTable(page: Page): Promise<void> {
  const edit = page
    .locator('[data-testid^="pdf-editor-recognized-table-edit-"]')
    .first();
  await edit.waitFor({ state: "attached" });
  const id = (await edit.getAttribute("data-testid"))!.replace(
    "pdf-editor-recognized-table-edit-",
    "",
  );
  const table = page.getByTestId(`pdf-editor-recognized-table-${id}`);
  await table.scrollIntoViewIfNeeded();
  const box = (await table.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await edit.click();
}
