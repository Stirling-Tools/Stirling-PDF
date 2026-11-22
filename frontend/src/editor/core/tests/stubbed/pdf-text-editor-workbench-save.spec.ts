import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import path from "path";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

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
async function editFirstRun(page: Page, text = "ZZSAVED") {
  const firstRun = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
  await expect(firstRun).toBeVisible({ timeout: 30_000 });
  const id = (await firstRun.getAttribute("data-testid")) ?? "";
  await page.evaluate(
    ([testId, inserted]) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      if (!el) throw new Error("run not found");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("insertText", false, inserted);
    },
    [id, text],
  );
  await expect(firstRun).toContainText(text);
  await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
}

/** The workbench view switcher's "Active Files" tab (a Mantine radio label). */
function activeFilesTab(page: Page) {
  return workbenchTab(page, /^Active Files$/);
}

function workbenchTab(page: Page, name: RegExp) {
  return page
    .locator(".workbench-bar-views label")
    .filter({ hasText: name })
    .first();
}

test.describe("PDF text editor - standardised save", () => {
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

  test("every save lands on the same file under its own name", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditorWithSample(page);
    const cards = page.getByTestId("file-thumbnail");

    for (const [text, version] of [
      ["ZZFIRST", "v2"],
      ["ZZSECOND", "v3"],
    ]) {
      await workbenchTab(page, /^Viewer$/).click();
      await editFirstRun(page, text);
      await page.getByTestId("pdf-editor-save").click();
      await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeHidden({
        timeout: 60_000,
      });

      await activeFilesTab(page).click();
      await expect(cards).toHaveCount(1);
      await expect(cards.first().getByTestId("file-version-badge")).toHaveText(
        version,
        { timeout: 30_000 },
      );
      await expect(cards.first()).toContainText("sample.pdf");
    }
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
    await openInTextEditor(page, SAMPLE_PDF);
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
