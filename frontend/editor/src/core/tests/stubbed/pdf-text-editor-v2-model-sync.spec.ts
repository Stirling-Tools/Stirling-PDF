import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// `PdfiumTextReader.populate` mints fresh runs with fresh ids, so re-reading a
// page after a commit would invalidate every id the selection, the undo stack
// and React's keys hold. `PdfiumModelSync.resyncPage` re-reads and folds the
// result onto the EXISTING run objects by PDFium object pointer instead. These
// pin that identity actually survives - the property the whole approach rests on.
const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

interface SyncResult {
  changed: boolean;
  matched: number;
  unmatched: number;
  appeared: number;
}

async function open(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
}

const RUN_IDS = () =>
  (
    window as unknown as {
      __v2_editor_store: {
        state: { pages: { runs: { id: string; text: string }[] }[] };
      };
    }
  ).__v2_editor_store.state.pages[0].runs.map((r) => r.id);

const RESYNC = () =>
  (
    window as unknown as {
      __v2_editor_store: { resyncPage: (i: number) => SyncResult | null };
    }
  ).__v2_editor_store.resyncPage(0);

test.describe("v2 editor - identity-preserving pdfium re-read", () => {
  for (const [label, file] of [
    ["single-line runs", SAMPLE_PDF],
    ["paragraph runs", PARAGRAPH_PDF],
  ] as const) {
    test(`re-reading ${label} matches every run and keeps its id`, async ({
      page,
    }) => {
      await open(page, file);
      const before = await page.evaluate(RUN_IDS);
      expect(before.length).toBeGreaterThan(0);

      const result = (await page.evaluate(RESYNC)) as SyncResult | null;
      expect(result, "resyncPage should return a result").not.toBeNull();
      // Every live run must be claimed by exactly one re-read run.
      expect(result!.matched).toBe(before.length);
      expect(result!.unmatched).toBe(0);
      expect(result!.appeared).toBe(0);

      const after = await page.evaluate(RUN_IDS);
      expect(after, "run ids must survive a re-read").toEqual(before);
    });
  }

  test("re-reading after an edit still matches the edited run by pointer", async ({
    page,
  }) => {
    await open(page, SAMPLE_PDF);
    const before = await page.evaluate(RUN_IDS);
    const tid = `v2-run-${before[0]}`;

    await page.evaluate((id) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${id}"]`,
      );
      if (!el) throw new Error("run missing");
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, "ZZ");
    }, tid);
    await page.waitForTimeout(300);

    const result = (await page.evaluate(RESYNC)) as SyncResult | null;
    expect(result).not.toBeNull();
    // The edit replaces objects, so pointer matching is what has to hold up.
    expect(result!.unmatched).toBe(0);
    expect(result!.matched).toBe(before.length);

    const after = await page.evaluate(RUN_IDS);
    expect(after, "ids must survive a re-read AFTER an edit").toEqual(before);
  });

  test("a re-read does not disturb the model's text", async ({ page }) => {
    await open(page, SAMPLE_PDF);
    const textOf = () =>
      page.evaluate(() =>
        (
          window as unknown as {
            __v2_editor_store: {
              state: { pages: { runs: { text: string }[] }[] };
            };
          }
        ).__v2_editor_store.state.pages[0].runs.map((r) => r.text),
      );
    const before = await textOf();
    await page.evaluate(RESYNC);
    await page.waitForTimeout(200);
    expect(await textOf()).toEqual(before);
  });
});
