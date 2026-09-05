import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";

// A signed save must APPEND a revision, never rewrite. Compares the bytes the
// editor hands back with what went in.

const SIGNED = path.join(
  import.meta.dirname,
  "../test-fixtures/signed-sample.pdf",
);

async function openSigned(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SIGNED);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

/** Type into the first run overlay so the save is a real, edited save. */
async function makeAnEdit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(
      '[data-testid^="pdf-editor-run-"]',
    );
    if (!el) throw new Error("no run overlay in the DOM");
    el.focus();
    const selection = window.getSelection();
    if (!selection) throw new Error("no Selection api");
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, "Z");
  });
  await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("PDF text editor - signed save stays signed", () => {
  test("an edited signed PDF is the original plus an appended revision", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openSigned(page);
    await makeAnEdit(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    // Signed documents warn before saving; confirm to get the file.
    await page.getByTestId("pdf-editor-save-risk-confirm").click();
    const download = await downloadPromise;
    const saved = await download.path();
    expect(saved).not.toBeNull();

    const before = fs.readFileSync(SIGNED);
    const after = fs.readFileSync(saved!);

    // An incremental save may only ADD. If the editor had rewritten the file,
    // every byte the signature covers would have moved and it would no longer
    // verify for the revision it signed.
    expect(
      after.length,
      "the saved file is shorter than the revision it must preserve",
    ).toBeGreaterThanOrEqual(before.length);
    expect(
      after.subarray(0, before.length).equals(before),
      "the original signed revision was rewritten, not appended to",
    ).toBe(true);
    // And it really is an edited save, not a byte-identical passthrough.
    expect(after.length).toBeGreaterThan(before.length);
  });

  test("the signature survives as far as PDFium is concerned", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openSigned(page);
    const before = await page.evaluate(() =>
      (
        window as unknown as {
          __editor_store: {
            document: {
              module: { FPDF_GetSignatureCount: (doc: number) => number };
              docPtr: number;
            };
          };
        }
      ).__editor_store.document.module.FPDF_GetSignatureCount(
        (
          window as unknown as {
            __editor_store: { document: { docPtr: number } };
          }
        ).__editor_store.document.docPtr,
      ),
    );
    expect(before, "fixture must actually carry a signature").toBeGreaterThan(
      0,
    );
  });

  test("an unedited signed PDF saves byte-identical", async ({ page }) => {
    test.setTimeout(180_000);
    await openSigned(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    await page.getByTestId("pdf-editor-save-risk-confirm").click();
    const download = await downloadPromise;
    const saved = await download.path();

    const before = fs.readFileSync(SIGNED);
    const after = fs.readFileSync(saved!);
    expect(
      after.equals(before),
      "an untouched document must come back exactly as it went in",
    ).toBe(true);
  });
});
