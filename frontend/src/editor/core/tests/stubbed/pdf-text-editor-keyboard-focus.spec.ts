import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  clearEditorSelection,
  openInTextEditor,
} from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import path from "path";
import { waitForEditorReady } from "@editor/tests/stubbed/editorReady";

// Where keyboard focus goes as Find, the selection bar and the right-click
// menu open and close, and what the menu offers on locked text.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
const HEADING = "p0-t0";
const BODY = "p0-t1";

interface StoreWin {
  __editor_store: {
    selection: {
      value: { runIds: string[] };
      selectMany: (ids: string[]) => void;
    };
  };
}

const run = (page: Page, id: string) =>
  page.locator(`[data-testid="pdf-editor-run-${id}"]`);

async function openParagraph(page: Page): Promise<void> {
  await openInTextEditor(page, PARAGRAPH_PDF);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await waitForEditorReady(page, 60_000);
}

function selectedRunIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as StoreWin).__editor_store.selection.value.runIds,
  );
}

function focusInside(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => !!document.activeElement?.closest(sel),
    selector,
  );
}

test.describe("PDF text editor - keyboard focus", () => {
  test("Ctrl+F while typing in a text box sends the search to Find", async ({
    page,
  }) => {
    await openParagraph(page);
    await run(page, BODY).click();
    await page.keyboard.press("Control+f");
    const input = page.getByTestId("pdf-editor-find-input");
    await expect(input).toBeFocused();

    await page.keyboard.type("zqx");
    await expect(input).toHaveValue("zqx");
    await expect(run(page, BODY)).not.toContainText("zqx");
  });

  test("Ctrl+F with Find open takes the cursor back to the search box", async ({
    page,
  }) => {
    await openParagraph(page);
    await page.keyboard.press("Control+f");
    const input = page.getByTestId("pdf-editor-find-input");
    await expect(input).toBeFocused();

    await run(page, BODY).click();
    await expect(input).not.toBeFocused();
    await page.keyboard.press("Control+f");
    await expect(input).toBeFocused();
  });

  test("Escape in the selection bar leaves it and keeps the selection", async ({
    page,
  }) => {
    await openParagraph(page);
    await run(page, BODY).click();
    await page.keyboard.press("Alt+F10");
    await expect
      .poll(() => focusInside(page, ".pdf-editor-selection-bar"))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect
      .poll(() => focusInside(page, ".pdf-editor-selection-bar"))
      .toBe(false);
    expect(await selectedRunIds(page)).toEqual([BODY]);
  });

  test("closing the right-click menu hands focus back", async ({ page }) => {
    await openParagraph(page);
    await clearEditorSelection(page);
    await run(page, BODY).click({ button: "right" });
    const menu = page.getByTestId("pdf-editor-context-menu");
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!document.activeElement &&
            document.activeElement !== document.body,
        ),
      )
      .toBe(true);
  });

  test("the right-click menu offers Copy but not Cut when locked text is selected", async ({
    page,
  }) => {
    await openParagraph(page);
    await run(page, HEADING).click();
    await page.getByTestId("pdf-editor-toggle-lock").click();
    await clearEditorSelection(page);
    await page.evaluate(
      (ids) =>
        (window as unknown as StoreWin).__editor_store.selection.selectMany(
          ids,
        ),
      [HEADING, BODY],
    );
    await run(page, BODY).click({ button: "right" });
    await expect(page.getByTestId("pdf-editor-context-menu")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-context-copy")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-context-cut")).toHaveCount(0);
  });
});
