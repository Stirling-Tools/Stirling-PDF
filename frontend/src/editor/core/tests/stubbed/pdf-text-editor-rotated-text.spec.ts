import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@editor/tests/stubbed/editorTestTypes";
import {
  downloadBytes,
  reopenSavedBytes,
} from "@editor/tests/stubbed/saveHelpers";

test.use({ autoGoto: false });

// Editing OBJECT-rotated text must keep the rotation, not force the re-emitted
// glyphs upright.

const ROTATED = path.join(
  import.meta.dirname,
  "../test-fixtures/rotated-text-sample.pdf",
);
const ROTATE90 = path.join(
  import.meta.dirname,
  "../test-fixtures/cropbox-rotate90.pdf",
);

async function rotatedRunMatrix(page: Page): Promise<{ a: number; b: number }> {
  return page.evaluate(() => {
    const s = (window as unknown as EditorTestWindow).__editor_store;
    const r = s.doc.page(0).runs.find((x) => /Rotated/.test(x.text));
    return r ? { a: r.matrix.a, b: r.matrix.b } : { a: 1, b: 0 };
  });
}

test("editing rotated text keeps its rotation through save+reopen", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(120_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  await openInTextEditor(page, ROTATED);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(500);

  // Sanity: the run loaded rotated (b is the sin component ~0.5).
  const before = await rotatedRunMatrix(page);
  expect(Math.abs(before.b)).toBeGreaterThan(0.3);

  // Edit the run, then commit (blur).
  const id = await page.evaluate(() => {
    const s = (window as unknown as EditorTestWindow).__editor_store;
    const r = s.doc.page(0).runs.find((x) => /Rotated/.test(x.text));
    return r ? r.id : null;
  });
  expect(id, "rotated run found").toBeTruthy();
  await page.evaluate((rid: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="pdf-editor-run-${rid}"]`,
    )!;
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, "X");
  }, id as string);
  await page.waitForTimeout(200);
  await page.evaluate((rid: string) => {
    document
      .querySelector<HTMLElement>(`[data-testid="pdf-editor-run-${rid}"]`)
      ?.blur();
  }, id as string);
  await page.waitForTimeout(1000);

  // Save + reopen, then confirm the run is STILL rotated (not forced upright).
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-download").click();
  const saved = await downloadBytes(await downloadPromise);
  await reopenSavedBytes(page, saved, "round-trip.pdf");

  const after = await rotatedRunMatrix(page);
  expect(
    Math.abs(after.b),
    `rotation preserved after edit+save+reopen (matrix.b=${after.b})`,
  ).toBeGreaterThan(0.3);
  expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
});

test("inserting text on a /Rotate 90 page lands upright (counter-rotated)", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(90_000);
  await openInTextEditor(page, ROTATE90);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(500);

  // Enter add-text mode and click the page to drop a new text run.
  await page.getByTestId("pdf-editor-add-text").click();
  await page
    .getByTestId("pdf-editor-page-0")
    .click({ position: { x: 120, y: 90 } });
  await page.waitForTimeout(500);

  // The inserted run must be counter-rotated so it reads upright on the
  // 90deg-displayed page (matrix.b non-zero), not axis-aligned.
  const m = await page.evaluate(() => {
    const s = (window as unknown as EditorTestWindow).__editor_store;
    const r = s.doc.page(0).runs.find((x) => /New text/.test(x.text));
    return r ? { a: r.matrix.a, b: r.matrix.b } : null;
  });
  expect(m, "inserted run found").toBeTruthy();
  expect(
    Math.abs(m!.b),
    `inserted text counter-rotated for the page (matrix=${JSON.stringify(m)})`,
  ).toBeGreaterThan(0.5);
});
