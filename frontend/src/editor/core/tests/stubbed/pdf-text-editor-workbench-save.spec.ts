import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { readFileSync } from "node:fs";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

// 4.3 "No standardised 'save PDF'". The editor only ever produced a download,
// so the workbench kept the pre-edit bytes and the next tool ran on them. Save
// now writes back through consumeFiles like every other tool, and downloading
// is the separate explicit step it is elsewhere.

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function openEditorWithSample(page: Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await uploadFiles(page, [SAMPLE_PDF]);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

/** Type into the first text run on page 0 so the document is genuinely dirty. */
async function editFirstRun(page: Page) {
  const firstRun = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
  await expect(firstRun).toBeVisible({ timeout: 30_000 });
  const id = (await firstRun.getAttribute("data-testid")) ?? "";
  await page.evaluate((testId) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (!el) throw new Error("run not found");
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand("insertText", false, "ZZSAVED");
  }, id);
  await expect(firstRun).toContainText("ZZSAVED");
  await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
}

/** The workbench view switcher's "Active Files" tab (a Mantine radio label). */
function activeFilesTab(page: Page) {
  return page
    .locator(".workbench-bar-views label")
    .filter({ hasText: /^Active Files$/ })
    .first();
}

test.describe("PDF text editor - standardised save", () => {
  test("a superseded disk open cannot join or replace the current workbench file", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 30_000,
    });
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      const gate = window as typeof window & {
        releaseFirstOpen?: () => void;
        firstReadStarted?: boolean;
        firstReadFinished?: boolean;
      };
      File.prototype.arrayBuffer = async function () {
        if (this.name === "first.pdf") {
          gate.firstReadStarted = true;
          await new Promise<void>((resolve) => {
            gate.releaseFirstOpen = resolve;
          });
          gate.firstReadFinished = true;
        }
        return original.call(this);
      };
    });
    const input = page.getByTestId("pdf-editor-file-input");
    const buffer = readFileSync(SAMPLE_PDF);
    await input.setInputFiles({
      name: "first.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await page.waitForFunction(
      () =>
        (window as typeof window & { firstReadStarted?: boolean })
          .firstReadStarted,
    );
    await input.setInputFiles({
      name: "second.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
    await page.evaluate(() =>
      (
        window as typeof window & { releaseFirstOpen?: () => void }
      ).releaseFirstOpen?.(),
    );
    await page.waitForFunction(
      () =>
        (window as typeof window & { firstReadFinished?: boolean })
          .firstReadFinished,
    );
    await activeFilesTab(page).click();
    const cards = page.getByTestId("file-thumbnail");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("second.pdf");
    await expect(page.getByText("first.pdf", { exact: true })).toHaveCount(0);
  });
  test("saving replaces the workbench file instead of only downloading", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithSample(page);
    await editFirstRun(page);

    // Plain save: no download is expected, the edit lands in the workbench.
    await page.getByTestId("pdf-editor-save").click();

    // The dirty marker clears only after the edit reaches the workbench.
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeHidden({
      timeout: 60_000,
    });

    await activeFilesTab(page).click();
    const card = page.getByTestId("file-thumbnail").first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    // consumeFiles builds a child stub, so the workbench file gains a version. On the
    // old code save never touched the workbench and the badge never appeared.
    await expect(
      card.getByTestId("file-version-badge"),
      "saving did not write the edit back to the workbench file",
    ).toHaveText("v2", { timeout: 30_000 });
  });

  test("cancelling the download still keeps the saved edit", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithSample(page);
    await editFirstRun(page);

    // Downloading is save + download, so the write-back must not be gated on
    // the browser accepting the file.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    const download = await downloadPromise;
    await download.cancel();

    await activeFilesTab(page).click();
    const card = page.getByTestId("file-thumbnail").first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(
      card.getByTestId("file-version-badge"),
      "a cancelled download discarded the save",
    ).toHaveText("v2", { timeout: 30_000 });
  });

  test("a file opened from disk inside the editor joins the workbench", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 30_000,
    });

    // Opened through the editor's own picker, so it has no workbench fileId.
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(SAMPLE_PDF);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
    await editFirstRun(page);

    await page.getByTestId("pdf-editor-save").click();
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeHidden({
      timeout: 60_000,
    });

    await activeFilesTab(page).click();
    await expect(
      page.getByTestId("file-thumbnail").first(),
      "an edit made on a disk-opened file never reached the workbench",
    ).toBeVisible({ timeout: 30_000 });
  });
});
