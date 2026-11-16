import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// A screen reader picks its voice by /Lang: the catalog's for the document,
// an element's own for a passage in another language (ISO 32000-1 14.9.2).
// Both are set in the inspector and must survive a save.

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/tagged-sample.pdf",
);

interface EditorWindow {
  __editor_store: {
    document: {
      documentLanguage: () => string | null;
      textLanguage: (
        pageIndex: number,
        mcid: number,
      ) => { own: string | null; inherited: string | null } | null;
    };
    state: {
      pages: { runs: { id: string; text: string; mcid?: number }[] }[];
    };
  };
  __prev_document?: unknown;
}

const RUN = (needle: string) =>
  (window as unknown as EditorWindow).__editor_store.state.pages[0].runs.find(
    (r) => r.text.includes(needle),
  ) ?? null;

async function openFixture(page: Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(FIXTURE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => page.evaluate(RUN, "product line"), { timeout: 30_000 })
    .not.toBeNull();
}

async function saveAndReopen(page: Page) {
  const downloaded = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("pdf-editor-download").click();
  const confirm = page.getByTestId("pdf-editor-save-risk-confirm");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const saved = test.info().outputPath("language.pdf");
  await (await downloaded).saveAs(saved);
  await page.evaluate(() => {
    const w = window as unknown as EditorWindow;
    w.__prev_document = w.__editor_store.document;
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(saved);
  await page.waitForFunction(
    () => {
      const w = window as unknown as EditorWindow;
      const s = w.__editor_store;
      if (!s?.document || s.document === w.__prev_document) return false;
      return (s.state.pages[0]?.runs.length ?? 0) > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function pickLanguage(page: Page, testId: string, tag: string) {
  const input = page.getByTestId(testId).getByRole("textbox");
  await input.click();
  await input.fill(tag);
  await page.getByRole("option", { name: new RegExp(`\\(${tag}\\)$`) }).click();
}

test.describe("PDF text editor - languages", () => {
  test("the document's and a paragraph's language are set and saved", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFixture(page);

    await page.getByTestId("pdf-editor-tab-document").click();
    const documentPicker = page
      .getByTestId("pdf-editor-document-language-picker")
      .getByRole("textbox");
    await expect(documentPicker).toHaveValue(/\(en-US\)$/);
    await pickLanguage(page, "pdf-editor-document-language-picker", "en-IE");
    await expect(documentPicker).toHaveValue(/\(en-IE\)$/);
    await page.screenshot({
      path: test.info().outputPath("document-language.png"),
    });

    const paragraph = (await page.evaluate(RUN, "product line"))!;
    await page.getByTestId(`pdf-editor-run-${paragraph.id}`).click();
    const textPicker = page
      .getByTestId("pdf-editor-text-language-picker")
      .getByRole("textbox");
    await expect(textPicker).toHaveValue(/English \(Ireland\)/);
    await pickLanguage(page, "pdf-editor-text-language-picker", "fr");
    await expect(textPicker).toHaveValue(/\(fr\)$/);
    await page.screenshot({
      path: test.info().outputPath("text-language.png"),
    });

    await saveAndReopen(page);
    const reopened = await page.evaluate((mcid) => {
      const doc = (window as unknown as EditorWindow).__editor_store.document;
      return {
        document: doc.documentLanguage(),
        paragraph: doc.textLanguage(0, mcid),
      };
    }, paragraph.mcid!);
    expect(reopened).toEqual({
      document: "en-IE",
      paragraph: { own: "fr", inherited: "en-IE" },
    });
  });
});
