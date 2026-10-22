import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

// The document's own face must survive an edit. Chrom Sans in this fixture is
// a full embedded face, not a subset; it must stay selected through a mid-word
// insert, and the saved PDF must reopen with the same family.
const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

async function open(page: Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 45_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __editor_store?: { state: { firstPageRendered: boolean } };
              }
            ).__editor_store?.state.firstPageRendered ?? false,
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
}

async function headingFont(page: Page): Promise<string> {
  return page.evaluate(() => {
    const run = (window as unknown as EditorTestWindow).__editor_store.doc
      .page(0)
      .runs.find((r) => r.text.startsWith("Heading"));
    return run?.fontId ?? "";
  });
}

function family(fontId: string): string {
  return fontId.slice(fontId.lastIndexOf(":") + 1);
}

test("a full embedded face survives a mid-word insert and a save", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(180_000);
  await open(page, FIXTURE);
  const before = await headingFont(page);
  expect(before.startsWith("pdf:") && !before.includes("Unknown")).toBe(true);

  const run = page
    .locator('[data-testid^="pdf-editor-run-p0-"]')
    .filter({ hasText: /^Heading/ })
    .first();
  const testId = (await run.getAttribute("data-testid")) ?? "";
  await run.click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => document.activeElement?.getAttribute("data-testid") === id,
        testId,
      ),
    )
    .toBe(true);

  await page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) throw new Error("run missing");
    const block = el.querySelector<HTMLElement>("[data-pdf-editor-line]")!;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let offset = 20;
    while (node && offset > (node.nodeValue ?? "").length) {
      offset -= (node.nodeValue ?? "").length;
      node = walker.nextNode();
    }
    const range = document.createRange();
    range.setStart(node!, offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, testId);
  await page.keyboard.type("X");
  await expect
    .poll(() => run.evaluate((el) => el.textContent ?? ""))
    .toContain("bigger Xsize");

  expect(await headingFont(page)).toBe(before);
  expect(family(await headingFont(page))).toBe(family(before));
  // Chrom Sans has no bytes FontFace can load, so the overlay must not paint a
  // substitute face over the bitmap while the caret is in the run.
  const overlay = await page.evaluate((id) => {
    const s = getComputedStyle(
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!,
    );
    return { color: s.color, background: s.backgroundColor };
  }, testId);
  expect(overlay.color).toBe("rgba(0, 0, 0, 0)");
  expect(overlay.background).toBe("rgba(0, 0, 0, 0)");

  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByTestId("pdf-editor-download").click();
  const saved = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pdf-face-")),
    "saved.pdf",
  );
  await (await download).saveAs(saved);

  await open(page, saved);
  const reopened = await headingFont(page);
  expect(family(reopened)).toBe(family(before));
  expect(reopened.startsWith("pdf:")).toBe(true);
});
