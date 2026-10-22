import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import path from "node:path";

test.use({ autoGoto: false });

// The hidden OCR layer deliberately names Helvetica-Bold on every row.
// Replacement text must match the scanned pixels, including regular faces.
const expectedFaces = [
  { prefix: "Regular sans", family: "Helvetica" },
  { prefix: "Bold sans", family: "Helvetica-Bold" },
  { prefix: "Regular serif", family: "Times-Roman" },
  { prefix: "Bold serif", family: "Times-Bold" },
  { prefix: "Regular mono", family: "Courier" },
  { prefix: "Bold mono", family: "Courier-Bold" },
];

for (const dpi of [96, 150, 600]) {
  test(`scan font weight stays regular or bold at ${dpi}dpi`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.route(
      "**/api/v1/general/pdf-text-editor/encode-charcodes",
      (route) => route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page.goto("/pdf-text-editor", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible();
    await page
      .getByTestId("pdf-editor-file-input")
      .setInputFiles(
        path.join(
          import.meta.dirname,
          `../test-fixtures/scanned-ocr-weight-${dpi}.pdf`,
        ),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { __editor_store: EditorStore }
            ).__editor_store.getState().pages[0]?.runs.length,
        ),
      )
      .toBe(6);
    const targets = await page.evaluate(() =>
      (window as unknown as { __editor_store: EditorStore }).__editor_store
        .getState()
        .pages[0].runs.map(({ id, text }) => ({
          id,
          text,
        })),
    );
    for (const target of targets) {
      await page.evaluate(({ id, text }) => {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="pdf-editor-run-${id}"]`,
        )!;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("insertText", false, text.replace("Jane", "Joan"));
        el.blur();
      }, target);
    }
    const styles = await page.evaluate(() =>
      (window as unknown as { __editor_store: EditorStore }).__editor_store
        .document!.page(0)
        .runs.map((run) => ({
          text: run.text,
          style: run.scanEdit?.block?.style,
        })),
    );
    for (const { prefix, family } of expectedFaces) {
      const run = styles.find(({ text }) => text.startsWith(prefix));
      expect.soft(run?.text, prefix).toContain("Joan");
      expect.soft(run?.style?.family, prefix).toBe(family);
      if (prefix.startsWith("Regular"))
        expect.soft(run?.style?.weight, prefix).toBe(0);
    }
    await page.screenshot({
      path: test.info().outputPath(`weight-${dpi}.png`),
      fullPage: true,
    });
  });
}
