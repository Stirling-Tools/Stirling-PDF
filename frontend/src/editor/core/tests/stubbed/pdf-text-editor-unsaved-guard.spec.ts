import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";
import { fileRows, viewFileRow } from "@editor/tests/helpers/pdf-text-editor";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

/** The name on the file-list row the viewer, and so the editor, has open. */
function openFile(page: Page) {
  return page.locator(".file-sidebar-file-item.viewed .file-sidebar-file-name");
}

/** Shows `name` in the viewer from its file-list row; the editor follows. */
async function viewFile(page: Page, name: string): Promise<void> {
  await viewFileRow(fileRows(page, name).first());
}

async function openEditorWithTwoFiles(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await uploadFiles(page, [SAMPLE_PDF, PARAGRAPH_PDF]);
  // Two files land on the file list; viewing one starts editing it.
  await viewFile(page, "sample.pdf");
  await expect(openFile(page)).toHaveText("sample.pdf", { timeout: 60_000 });
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

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
  await viewFile(page, other);
  return other;
}

test.describe("PDF text editor - unsaved-changes guard", () => {
  test("switching files with unsaved edits asks first", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (await openFile(page).innerText()).trim();
    await makeAnEdit(page);

    await pickOtherFile(page, opened);

    await expect(
      page.getByTestId("unsaved-discard"),
      "switching files must not discard edits without asking",
    ).toBeVisible({ timeout: 10_000 });
    await expect(openFile(page)).toHaveText(opened);
  });

  test("cancelling keeps the document, its edits and its history", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (await openFile(page).innerText()).trim();
    await makeAnEdit(page);

    await pickOtherFile(page, opened);
    await page.getByRole("button", { name: "Keep Working" }).click();

    await expect(page.getByTestId("unsaved-discard")).toBeHidden();
    await expect(page.getByTestId("pdf-editor-discard-modal")).toBeHidden();
    await expect(openFile(page)).toContainText(opened);
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
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
    const opened = (await openFile(page).innerText()).trim();
    await makeAnEdit(page);

    const other = await pickOtherFile(page, opened);
    await page.getByTestId("unsaved-discard").click();

    await expect(openFile(page)).toHaveText(other, {
      timeout: 60_000,
    });
    // The app's prompt settled it: the editor must not ask a second time.
    await expect(page.getByTestId("pdf-editor-discard-modal")).toBeHidden();
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeHidden();
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
  });

  test("a clean document switches with no prompt at all", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    const opened = (await openFile(page).innerText()).trim();

    const other = await pickOtherFile(page, opened);

    await expect(openFile(page)).toHaveText(other, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("unsaved-discard")).toBeHidden();
  });

  test("closing the tool asks before the tool view slides away", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithTwoFiles(page);
    await makeAnEdit(page);
    await page.evaluate(() => {
      const w = window as unknown as { __toolLayerLeft: boolean };
      w.__toolLayerLeft = false;
      new MutationObserver(() => {
        if (!document.querySelector(".tool-panel__tool-layer")) {
          w.__toolLayerLeft = true;
        }
      }).observe(document.body, { childList: true, subtree: true });
    });

    const close = page.getByRole("button", { name: "Back to all tools" });
    await close.click();
    await expect(page.getByTestId("unsaved-discard")).toBeVisible();
    await page.getByRole("button", { name: "Keep Working" }).click();

    await expect(page.getByTestId("unsaved-discard")).toBeHidden();
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __toolLayerLeft: boolean }).__toolLayerLeft,
      ),
      "the tool view must not leave before the user answers",
    ).toBe(false);

    await close.click();
    await page.getByTestId("unsaved-discard").click();
    await expect(
      page.locator('[data-tour="tool-button-compress"]'),
    ).toBeVisible();
    await expect(page.locator(".tool-panel__tool-layer")).toHaveCount(0);
    await expect(page.getByTestId("unsaved-discard")).toBeHidden();
  });
});
