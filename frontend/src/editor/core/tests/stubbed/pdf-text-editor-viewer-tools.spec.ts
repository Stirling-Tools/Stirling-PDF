import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const SIGNED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/signed-sample.pdf",
);

const editText = (page: Page) => page.getByTestId("viewer-edit-text");
const ruler = (page: Page) =>
  page.getByRole("button", { name: "Ruler / Measure", exact: true });

async function openEditor(page: Page, file = SAMPLE_PDF): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, file);
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
    document.execCommand("insertText", false, "RULED");
  });
  await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible({
    timeout: 15_000,
  });
}

async function expectEditorClosedWithRuler(page: Page): Promise<void> {
  await expect(editText(page)).toHaveAttribute("aria-pressed", "false", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
  await expect(ruler(page)).toHaveAttribute("aria-pressed", "true");
}

test.describe("PDF text editor - viewer tools", () => {
  test("the ruler closes the editor when there is nothing to save", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await ruler(page).click();
    await expect(page.getByTestId("unsaved-discard")).toBeHidden();
    await expectEditorClosedWithRuler(page);
  });

  test("the ruler asks about unsaved edits, and Keep Working stays", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await makeAnEdit(page);
    await ruler(page).click();
    await page.getByRole("button", { name: "Keep Working" }).click();

    await expect(editText(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
    await expect(ruler(page)).not.toHaveAttribute("aria-pressed", "true");
  });

  test("discarding at the prompt closes the editor and opens the ruler", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await makeAnEdit(page);
    await ruler(page).click();
    await page.getByTestId("unsaved-discard").click();
    await expectEditorClosedWithRuler(page);
  });

  test("saving at the prompt writes the edits, then opens the ruler", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await makeAnEdit(page);
    await ruler(page).click();
    await page.getByTestId("unsaved-save").click();
    await expectEditorClosedWithRuler(page);

    // The edit is in the workbench file: reopening the editor shows it.
    await ruler(page).click();
    await editText(page).click();
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (
              window as unknown as {
                __editor_store?: {
                  getState: () => {
                    pages: Array<{ runs: Array<{ text: string }> }>;
                  };
                };
              }
            ).__editor_store
              ?.getState()
              .pages.flatMap((p) => p.runs)
              .some((r) => r.text.includes("RULED")),
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  });

  test("saving a signed PDF at the prompt warns first", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page, SIGNED_PDF);
    await makeAnEdit(page);
    await ruler(page).click();
    await page.getByTestId("unsaved-save").click();

    // Cancelling the warning keeps the prompt and the edits.
    await page.getByTestId("pdf-editor-save-risk-cancel").click();
    await expect(page.getByTestId("unsaved-save")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();

    await page.getByTestId("unsaved-save").click();
    await expect(page.getByTestId("pdf-editor-save-risk-modal")).toContainText(
      /signature/i,
    );
    await page.getByTestId("pdf-editor-save-risk-confirm").click();
    await expectEditorClosedWithRuler(page);
  });

  for (const tool of ["Pan Mode", "Search PDF"]) {
    test(`${tool} closes the editor too`, async ({ page }) => {
      test.setTimeout(120_000);
      await openEditor(page);
      await page.getByRole("button", { name: tool, exact: true }).click();
      await expect(editText(page)).toHaveAttribute("aria-pressed", "false", {
        timeout: 15_000,
      });
      await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
    });
  }

  test("opening the editor turns the ruler off", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await ruler(page).click();
    await expectEditorClosedWithRuler(page);
    await editText(page).click();
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
    await expect(ruler(page)).not.toHaveAttribute("aria-pressed", "true");
  });
});
