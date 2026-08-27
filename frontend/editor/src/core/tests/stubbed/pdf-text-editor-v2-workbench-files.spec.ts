import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

// 4.2 "Active file selection does not work while in the editor". Three defects:
// the editor re-pinned its own workbench view on EVERY navigation change; the
// Active Files view trims a multi-file selection to its last entry, which the
// editor followed - swapping the open document and pinning its canvas back over
// the file list; and the editor offered no way to say which file to edit.

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

// Upload AFTER landing on the tool: a page load drops the active workbench
// (the files survive only in the library), which is the state under test.
async function openEditorWithTwoFiles(page: Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await uploadFiles(page, [SAMPLE_PDF, PARAGRAPH_PDF]);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
}

/** The workbench view switcher's "Active Files" tab (a Mantine radio label). */
function activeFilesTab(page: Page) {
  return page
    .locator(".workbench-bar-views label")
    .filter({ hasText: /^Active Files$/ })
    .first();
}

test.describe("v2 editor - workbench file selection", () => {
  test("the Active Files view stays open when opened from the editor", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);

    await activeFilesTab(page).click();
    // Long enough for the pin effect to fire and bounce us back if it still can.
    await page.waitForTimeout(2000);

    await expect(
      page.getByTestId("file-thumbnail").first(),
      "the editor pinned its own canvas back over the file list",
    ).toBeVisible({ timeout: 10_000 });
  });

  test("opening Active Files does not swap the document being edited", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (await page.getByTestId("v2-filename").innerText()).trim();

    // Mounting Active Files trims the selection to its last entry to honour the
    // tool's one-file limit; the editor must not follow that onto another file.
    await activeFilesTab(page).click();
    await page.waitForTimeout(2000);

    await expect(
      page.getByTestId("v2-filename"),
      "the editor swapped the open document out from under the user",
    ).toHaveText(opened);
  });

  test("the editor lists the workbench files and opens the one picked", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);

    await expect(
      page.getByTestId("v2-file-switcher"),
      "with two workbench files the editor must offer a way to choose one",
    ).toBeVisible({ timeout: 15_000 });

    // Whichever landed first is open; pick the other one.
    const opened = (await page.getByTestId("v2-filename").innerText()).trim();
    const other =
      opened === "sample.pdf" ? "paragraph-sample.pdf" : "sample.pdf";

    await page
      .getByTestId("v2-file-switch")
      .filter({ hasText: new RegExp(`^${other}$`) })
      .first()
      .click();

    await expect(
      page.getByTestId("v2-filename"),
      "picking a file in the editor must open it",
    ).toHaveText(other, { timeout: 60_000 });
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 60_000,
    });
    // The picked entry is the one marked current.
    await expect(
      page.locator('[data-testid="v2-file-switch"][data-current="true"]'),
    ).toHaveText(other);
  });
});
