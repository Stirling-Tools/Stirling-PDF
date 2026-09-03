import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Emptying a text box must empty it in the PDF, not just the model.
// FPDFText_SetText traps on an empty string, so the deleted text used to
// survive in the object and reappear on save.

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const SECRET = "SHOULDVANISH";

async function openEditor(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE_PDF);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

/** Drop a new text box on page 0 and return its run id. */
async function addTextBox(page: Page): Promise<string> {
  await page.getByTestId("pdf-editor-add-text").click();
  await page
    .getByTestId("pdf-editor-page-0")
    .click({ position: { x: 200, y: 600 } });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const runs = (
      window as unknown as {
        __editor_store: {
          getState: () => { pages: Array<{ runs: Array<{ id: string }> }> };
        };
      }
    ).__editor_store.getState().pages[0].runs;
    return runs[runs.length - 1].id;
  });
}

/** Select everything in a run overlay, delete it, and optionally retype. */
async function clearRun(
  page: Page,
  runId: string,
  retype?: string,
): Promise<void> {
  await page.evaluate(
    ({ id, text }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      );
      if (!el) throw new Error(`run ${id} not in DOM`);
      el.focus();
      const selection = window.getSelection();
      if (!selection) throw new Error("no Selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("delete", false);
      if (text) document.execCommand("insertText", false, text);
    },
    { id: runId, text: retype },
  );
  await page.waitForTimeout(500);
}

async function typeInto(page: Page, runId: string, text: string) {
  await page.evaluate(
    ({ id, t }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      );
      if (!el) throw new Error(`run ${id} not in DOM`);
      el.focus();
      const selection = window.getSelection();
      if (!selection) throw new Error("no Selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("delete", false);
      document.execCommand("insertText", false, t);
    },
    { id: runId, t: text },
  );
  await page.waitForTimeout(500);
}

/** Every run's text on page 0, as the model currently has it. */
async function pageText(page: Page): Promise<string> {
  return page.evaluate(() =>
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
      .map((r) => r.text)
      .join(" | "),
  );
}

/** Download the edited PDF and re-open it in the editor. */
async function saveAndReopen(page: Page): Promise<void> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-download").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  await page.locator('[data-testid="pdf-editor-file-input"]').setInputFiles({
    name: "round.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat(chunks),
  });
  await expect(
    page.locator('[data-testid^="pdf-editor-run-p0-"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
}

test.describe("PDF text editor - emptying a text box", () => {
  test("clearing an Add-text box removes the text from the saved PDF", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    const runId = await addTextBox(page);
    await typeInto(page, runId, SECRET);
    expect(await pageText(page)).toContain(SECRET);

    await clearRun(page, runId);
    expect(
      await pageText(page),
      "the model must show the box as empty",
    ).not.toContain(SECRET);

    // The real check: the PDF, not the model. A trap inside the in-place write
    // left the object untouched, so the "deleted" text came back on save.
    await saveAndReopen(page);
    expect(
      await pageText(page),
      "text deleted before saving must not reappear in the saved PDF",
    ).not.toContain(SECRET);
  });

  test("clearing then retyping saves what was typed, not what was cleared", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    const runId = await addTextBox(page);
    await typeInto(page, runId, SECRET);

    await clearRun(page, runId, "kept");
    expect(await pageText(page)).toContain("kept");

    await saveAndReopen(page);
    const after = await pageText(page);
    expect(after).toContain("kept");
    expect(after).not.toContain(SECRET);
  });

  test("clearing raises no error and stays undoable", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    const runId = await addTextBox(page);
    await typeInto(page, runId, SECRET);
    // Past the 600ms coalescing window, so the clear is its own undo step
    // rather than merging into the typing that preceded it.
    await page.waitForTimeout(900);

    await clearRun(page, runId);
    // A trap used to reach the store's recovery path, which rebuilds every
    // page and throws the whole undo history away.
    expect(await page.getByTestId("pdf-editor-error").count()).toBe(0);

    await page.getByTestId("pdf-editor-undo").click();
    await page.waitForTimeout(500);
    expect(await pageText(page), "undo must bring the text back").toContain(
      SECRET,
    );
  });
});
