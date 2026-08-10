import { expect } from "@app/tests/helpers/stub-test-base";
import type { Download, Page } from "@playwright/test";

/**
 * Save helpers for the v2 PDF text editor specs.
 *
 * The save-risk modal is the ONLY gate to the download: `handleSave` returns
 * WITHOUT calling `doSave()` while a risk is pending, so if the confirm is
 * never clicked no download is ever produced and a `waitForEvent("download")`
 * burns its full timeout. `locator.isVisible({ timeout })` cannot be used to
 * detect the modal - Playwright ignores that timeout and polls once, which
 * loses the race whenever the modal mounts after the save click resolves.
 */

/**
 * Click save and resolve with the resulting download.
 *
 * `expectRisk` states up front whether this edit drops unrepresentable
 * characters. Making it explicit (rather than probing for the modal) keeps the
 * no-risk path from waiting on a modal that never mounts, and makes a missing
 * or unexpected modal fail as itself instead of as a download timeout.
 */
export async function saveAndDownload(
  page: Page,
  expectRisk: boolean,
): Promise<Download> {
  const confirm = page.getByTestId("v2-save-risk-confirm");

  if (!expectRisk) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    // The download landing already proves nothing gated the save; assert the
    // modal never mounted so a new risk regression fails loudly right here.
    await expect(confirm).toHaveCount(0);
    return download;
  }

  await page.getByTestId("v2-save").click();
  // Wait for the modal itself before arming the download listener, so each
  // phase gets its own budget and a stalled modal is reported as a stalled
  // modal.
  await expect(confirm).toBeVisible({ timeout: 10_000 });
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
  __v2_editor_store?: {
    document: unknown;
    state: { pages: { runs: unknown[] }[] };
  };
  __v2_prev_document?: unknown;
}

/**
 * Record the currently-loaded document so {@link waitForReopenedPage} can tell
 * the reopened document apart from the one still on screen. Call immediately
 * before feeding saved bytes back into the file input.
 */
export async function stashCurrentDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as DocIdentityWindow;
    w.__v2_prev_document = w.__v2_editor_store?.document;
  });
}

/**
 * Wait until a genuinely NEW document has loaded and populated `pageIndex`.
 *
 * Waiting on DOM visibility alone is not enough after a re-upload: the previous
 * document's pages are still mounted and satisfy those selectors instantly, so
 * the model can still be empty (or still be the old document) when the spec
 * reads it. `setDocument` installs a fresh document object and resets `pages`
 * to `[]`, so requiring a changed document identity AND a populated page is
 * what actually proves the round-trip finished.
 */
export async function waitForReopenedPage(
  page: Page,
  pageIndex: number,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (idx: number) => {
      const w = window as unknown as DocIdentityWindow;
      const store = w.__v2_editor_store;
      if (!store?.document || store.document === w.__v2_prev_document) {
        return false;
      }
      return (store.state.pages[idx]?.runs.length ?? 0) > 0;
    },
    pageIndex,
    { timeout },
  );
}
