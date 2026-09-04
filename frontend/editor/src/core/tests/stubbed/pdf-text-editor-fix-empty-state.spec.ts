import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

// The editor could reach an empty state it could not leave. Auto-open stood
// down on its own memory of having opened a file, but that memory lives in a
// panel ref while the document lives in a module-singleton store that drops it
// when the canvas unmounts. Once the two disagreed, every guard said "already
// opened" while the screen said "no document", and re-selecting the file did
// nothing.
//
// Both tests use a real workbench file, because that is the only kind
// auto-open has a candidate for: a file dropped straight onto the editor is
// deliberately not one.

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

interface EditorWindow {
  __editor_store?: {
    state: {
      hasDocument: boolean;
      loading: boolean;
      error: string | null;
    };
    clearDocument: () => void;
  };
}

async function editorState(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as EditorWindow).__editor_store;
    if (!s) return null;
    const { hasDocument, loading, error } = s.state;
    return { hasDocument, loading, error };
  });
}

/** Everything that decides whether auto-open can fire, for a failure message. */
async function loadContext(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as EditorWindow).__editor_store;
    const idb = (
      window as unknown as { __file_debug?: Record<string, unknown> }
    ).__file_debug;
    return {
      hasDocument: s?.state.hasDocument ?? null,
      loading: s?.state.loading ?? null,
      error: s?.state.error ?? null,
      stage: !!document.querySelector('[data-testid="pdf-editor-stage"]'),
      pages: document.querySelectorAll('[data-testid^="pdf-editor-page-"]')
        .length,
      fileItems: document.querySelectorAll(".file-sidebar-file-item").length,
      idb: idb ?? null,
    };
  });
}

async function expectDocumentOpen(page: Page, when: string) {
  await expect
    .poll(async () => (await editorState(page))?.hasDocument ?? false, {
      timeout: 25_000,
      intervals: [300, 500, 800, 1200],
      message: `the editor never held a document ${when}`,
    })
    .toBe(true)
    .catch(async (err: unknown) => {
      // eslint-disable-next-line no-console
      console.log(
        `EMPTYSTATE-FAIL ${when}: ${JSON.stringify(await loadContext(page))}`,
      );
      throw err;
    });
}

/** Put the sample in the workbench, then open the text editor on it. */
async function openEditorOnWorkbenchFile(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await uploadFiles(page, SAMPLE);
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await expectDocumentOpen(page, "after opening the tool on a workbench file");
  // hasDocument flips true before the pages finish loading, and a clear that
  // lands mid-load disposes the document being read ("failed to load page 2"),
  // which is the invalid injection the rounds below already guard against.
  // Settle the same way they do before handing the editor to the test body.
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
}

test.describe("PDF text editor - it never gets stuck with no document", () => {
  test("the canvas dropping its document does not strand the editor", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorOnWorkbenchFile(page);

    // clearDocument is exactly what the canvas unmounting does to the shared
    // store, so this is the disagreement itself rather than an imitation of it.
    for (let round = 1; round <= 3; round += 1) {
      await page.evaluate(() => {
        (window as unknown as EditorWindow).__editor_store?.clearDocument();
      });
      expect(
        (await editorState(page))?.hasDocument,
        `round ${round}: the store did not actually clear`,
      ).toBe(false);
      await expectDocumentOpen(page, `after clear round ${round}`);
      // Let the recovery finish before dropping the document again. The real
      // trigger is a canvas unmount, which cannot arrive twice inside a load;
      // clearing mid-load disposes the document being read and fails the page.
      await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(800);
    }
  });

  test("deselecting and reselecting the file leaves a document open", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorOnWorkbenchFile(page);

    // Opening Active Files swaps the canvas away on purpose, and the editor
    // must not pin it back (see pdf-text-editor-workbench-files). So the
    // round is: go to the list, toggle the selection, come back - and the
    // editor has to have a document again when the user returns to it.
    for (let round = 1; round <= 3; round += 1) {
      const filesButton = page.getByTestId("files-button");
      await filesButton.click();
      const item = page.locator(".file-sidebar-file-item").first();
      await expect(item).toBeVisible({ timeout: 10_000 });
      await item.click();
      await page.waitForTimeout(500);
      await item.click();
      await page.waitForTimeout(500);
      // eslint-disable-next-line no-console
      console.log(
        `EMPTYSTATE round ${round} in list: ${JSON.stringify(await editorState(page))}`,
      );
      await filesButton.click();
      await page.waitForTimeout(1500);
      // eslint-disable-next-line no-console
      console.log(
        `EMPTYSTATE round ${round} back: ${JSON.stringify(await editorState(page))}`,
      );
      await expectDocumentOpen(
        page,
        `after returning from the list, round ${round}`,
      );
    }
  });
});
