import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

/**
 * Opening a second document must not silently bin the first one's edits.
 *
 * Every route in disposes the open PDFium document and its whole undo history,
 * so a stray click in the file switcher used to throw away everything the user
 * had typed with no warning at all.
 */

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

async function openEditorWithTwoFiles(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await uploadFiles(page, [SAMPLE_PDF, PARAGRAPH_PDF]);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

/** Type into the first run overlay, the way a user would. */
async function makeAnEdit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(
      '[data-testid^="pdf-editor-run-"]',
    );
    if (!el) throw new Error("no run overlay in the DOM");
    el.focus();
    const selection = window.getSelection();
    if (!selection) throw new Error("no Selection api");
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, "GUARDED");
  });
  await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible({
    timeout: 15_000,
  });
}

async function pickOtherFile(page: Page, opened: string): Promise<string> {
  const other = opened === "sample.pdf" ? "paragraph-sample.pdf" : "sample.pdf";
  await page.getByTestId("pdf-editor-file-switcher").click();
  await page
    .getByTestId("pdf-editor-file-switch")
    .filter({ hasText: new RegExp(`^${other}$`) })
    .first()
    .click();
  return other;
}

test.describe("PDF text editor - unsaved-changes guard", () => {
  test("switching files with unsaved edits asks first", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (
      await page.getByTestId("pdf-editor-filename").innerText()
    ).trim();
    await makeAnEdit(page);

    const other = await pickOtherFile(page, opened);

    // The modal root stays mounted, so assert on what the user actually sees.
    await expect(
      page.getByTestId("pdf-editor-discard-confirm"),
      "switching files must not discard edits without asking",
    ).toBeVisible({ timeout: 10_000 });
    // The prompt names the file it would open, so the answer is informed.
    await expect(
      page
        .getByTestId("pdf-editor-discard-modal")
        .locator(".mantine-Modal-body"),
    ).toContainText(other);
  });

  test("cancelling keeps the document, its edits and its history", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (
      await page.getByTestId("pdf-editor-filename").innerText()
    ).trim();
    await makeAnEdit(page);

    await pickOtherFile(page, opened);
    await page.getByTestId("pdf-editor-discard-cancel").click();

    await expect(page.getByTestId("pdf-editor-discard-confirm")).toBeHidden();
    await expect(page.getByTestId("pdf-editor-filename")).toContainText(opened);
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
    // The edit itself is still in the model, not just the dirty flag.
    const stillThere = await page.evaluate(() =>
      (
        window as unknown as {
          __editor_store: {
            getState: () => {
              pages: Array<{ runs: Array<{ text: string }> }>;
            };
          };
        }
      ).__editor_store
        .getState()
        .pages.flatMap((p) => p.runs)
        .some((r) => r.text.includes("GUARDED")),
    );
    expect(stillThere).toBe(true);
  });

  test("confirming opens the other file", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (
      await page.getByTestId("pdf-editor-filename").innerText()
    ).trim();
    await makeAnEdit(page);

    const other = await pickOtherFile(page, opened);
    await page.getByTestId("pdf-editor-discard-confirm").click();

    await expect(page.getByTestId("pdf-editor-filename")).toHaveText(other, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
  });

  test("a clean document switches with no prompt at all", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (
      await page.getByTestId("pdf-editor-filename").innerText()
    ).trim();

    const other = await pickOtherFile(page, opened);

    await expect(page.getByTestId("pdf-editor-filename")).toHaveText(other, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("pdf-editor-discard-confirm")).toBeHidden();
  });

  test("opening a file from disk over unsaved edits asks too", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    await makeAnEdit(page);

    // The same input the drag-and-drop handler feeds.
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(PARAGRAPH_PDF);

    await expect(
      page.getByTestId("pdf-editor-discard-confirm"),
      "a dropped file must not discard edits without asking",
    ).toBeVisible({ timeout: 10_000 });
  });
});
