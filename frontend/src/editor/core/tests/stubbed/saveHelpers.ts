import { expect } from "@editor/tests/helpers/stub-test-base";
import type { Download, Page } from "@playwright/test";
import {
  openInTextEditor,
  scrollToEditorPage,
} from "@editor/tests/helpers/pdf-text-editor";

/** Save helpers for the PDF text editor specs. */

// Click download and resolve with the resulting file. Plain save only applies
// the edit to the workbench; `expectRisk` states up front whether this edit
// drops unrepresentable characters.
export async function saveAndDownload(
  page: Page,
  expectRisk: boolean,
): Promise<Download> {
  const confirm = page.getByTestId("pdf-editor-save-risk-confirm");

  if (!expectRisk) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    const download = await downloadPromise;
    // The download landing already proves nothing gated the save; assert the
    // modal never mounted so a new risk regression fails loudly right here.
    await expect(confirm).toHaveCount(0);
    return download;
  }

  await page.getByTestId("pdf-editor-download").click();
  // Wait for the modal itself before arming the download listener.
  await expect(confirm).toBeVisible({ timeout: 10_000 });
  // The modal slides in; a click while it moves presses the button and
  // releases past it, so no click fires and the download never starts.
  await expect
    .poll(() =>
      confirm.evaluate(
        (button) =>
          (button.closest('[role="dialog"]') ?? button)
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
  const downloadPromise = page.waitForEvent("download");
  await confirm.click();
  return downloadPromise;
}

/** Drain a download to a Buffer. */
export async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

interface DocIdentityWindow {
  __editor_store?: {
    document: unknown;
    state: { pages: { runs: unknown[] }[] };
  };
  __prev_document?: unknown;
}

// Record the currently-loaded document so {@link waitForReopenedPage} can tell
// the reopened document apart from the one still on screen.
export async function stashCurrentDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as DocIdentityWindow;
    w.__prev_document = w.__editor_store?.document;
  });
}

/** Wait until a genuinely NEW document has loaded and populated `pageIndex`. */
export async function waitForReopenedPage(
  page: Page,
  pageIndex: number,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (idx: number) => {
      const w = window as unknown as DocIdentityWindow;
      const store = w.__editor_store;
      if (!store?.document || store.document === w.__prev_document) {
        return false;
      }
      return (store.state.pages[idx]?.runs.length ?? 0) > 0;
    },
    pageIndex,
    { timeout },
  );
}

/**
 * Open `bytes` the way a user reopens a saved copy and wait until they, not the
 * document they replace, have populated `pageIndex`. The replaced document's
 * runs stay mounted while the new file is read, and for a moment afterwards the
 * new document has no pages, so a wait on a visible run resolves too early.
 */
export async function reopenSavedBytes(
  page: Page,
  bytes: Buffer,
  name: string,
  pageIndex = 0,
  timeout = 30_000,
  { zoomPercent }: { zoomPercent?: number | null } = {},
): Promise<void> {
  await stashCurrentDocument(page);
  await openInTextEditor(
    page,
    { name, mimeType: "application/pdf", buffer: bytes },
    zoomPercent === undefined ? undefined : { zoomPercent },
  );
  if (pageIndex > 0) await scrollToEditorPage(page, pageIndex);
  await waitForReopenedPage(page, pageIndex, timeout);
}
