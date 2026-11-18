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

  test("pan closes the editor too", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await page.getByRole("button", { name: "Pan Mode", exact: true }).click();
    await expect(editText(page)).toHaveAttribute("aria-pressed", "false", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
  });

  test("search opens the editor's find bar and keeps the edits", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await makeAnEdit(page);
    // Its label says what it opens here.
    await expect(
      page.getByRole("button", { name: "Search PDF", exact: true }),
    ).toHaveCount(0);
    const search = page.getByRole("button", {
      name: "Find & replace",
      exact: true,
    });

    await search.click();
    await expect(page.getByTestId("pdf-editor-find-bar")).toBeVisible();
    await expect(page.getByTestId("unsaved-discard")).toBeHidden();
    await expect(editText(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();

    await search.click();
    await expect(page.getByTestId("pdf-editor-find-bar")).toBeHidden();
  });

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

test("Edit text in the viewer's selection menu opens the editor on that text", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 30_000,
  });

  let box = await firstPage.boundingBox();
  let y = 0;
  await expect
    .poll(async () => {
      box = await firstPage.boundingBox();
      if (!box) return "no box";
      y = box.y + box.height * 0.105;
      await page.mouse.move(box.x + 5, box.y + 5);
      await page.mouse.move(box.x + box.width * 0.15, y, { steps: 5 });
      return firstPage.evaluate(
        (el) => getComputedStyle(el.parentElement ?? el).cursor,
      );
    })
    .toMatch(/^(text|vertical-text)$/);
  if (!box) throw new Error("page has no bounding box");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
  await page.getByTestId("text-selection-edit-text").click();

  await expect(editText(page)).toHaveAttribute("aria-pressed", "true", {
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const store = (
            window as unknown as {
              __editor_store?: {
                selection: {
                  value: {
                    runIds: string[];
                    textRange: { start: number; end: number } | null;
                  };
                };
                getState: () => {
                  pages: Array<{ runs: Array<{ id: string; text: string }> }>;
                };
              };
            }
          ).__editor_store;
          const sel = store?.selection.value;
          if (!store || !sel?.textRange || sel.runIds.length !== 1) return "";
          const run = store
            .getState()
            .pages[0]?.runs.find((r) => r.id === sel.runIds[0]);
          return run?.text.slice(sel.textRange.start, sel.textRange.end) ?? "";
        }),
      { timeout: 60_000 },
    )
    // The line dragged across in the viewer.
    .toContain("Test document");
  await expect(page.locator("[data-text-selection-menu]")).toHaveCount(0);

  // The run is open for editing with that span selected, so typing replaces it.
  const focusedRun = page.locator('[data-testid^="pdf-editor-run-"]:focus');
  await expect(focusedRun).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => String(window.getSelection())))
    .toContain("Test document");
  await page.keyboard.type("Replaced");
  await expect(focusedRun).toContainText("Replaced");
  await expect(focusedRun).not.toContainText("Test document");
});
