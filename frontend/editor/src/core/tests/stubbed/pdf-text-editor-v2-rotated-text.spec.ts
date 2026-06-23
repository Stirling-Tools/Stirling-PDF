import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/**
 * Editing OBJECT-rotated text (a text run whose matrix is rotated within an
 * upright page) must keep the rotation, not force the re-emitted glyphs upright
 * (finding N). The fixture's "Rotated" run is at 30 degrees (matrix b ~ 0.5).
 *
 * Backend-free: encode-charcodes aborted so the edit takes the client emit path.
 */

const ROTATED = path.join(
  __dirname,
  "../test-fixtures/rotated-text-sample.pdf",
);
const ROTATE90 = path.join(__dirname, "../test-fixtures/cropbox-rotate90.pdf");

async function rotatedRunMatrix(page: Page): Promise<{ a: number; b: number }> {
  return page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
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

  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(ROTATED);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  // Sanity: the run loaded rotated (b is the sin component ~0.5).
  const before = await rotatedRunMatrix(page);
  expect(Math.abs(before.b)).toBeGreaterThan(0.3);

  // Edit the run, then commit (blur).
  const id = await page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    const r = s.doc.page(0).runs.find((x) => /Rotated/.test(x.text));
    return r ? r.id : null;
  });
  expect(id, "rotated run found").toBeTruthy();
  await page.evaluate((rid: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${rid}"]`,
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
      .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
      ?.blur();
  }, id as string);
  await page.waitForTimeout(1000);

  // Save + reopen, then confirm the run is STILL rotated (not forced upright).
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("v2-save").click();
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  await page.locator('[data-testid="v2-file-input"]').setInputFiles({
    name: "round-trip.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat(chunks),
  });
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

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
  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(ROTATE90);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  // Enter add-text mode and click the page to drop a new text run.
  await page.getByTestId("v2-add-text").click();
  await page.getByTestId("v2-page-0").click({ position: { x: 120, y: 90 } });
  await page.waitForTimeout(500);

  // The inserted run must be counter-rotated so it reads upright on the
  // 90deg-displayed page (matrix.b non-zero), not axis-aligned.
  const m = await page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    const r = s.doc.page(0).runs.find((x) => /New text/.test(x.text));
    return r ? { a: r.matrix.a, b: r.matrix.b } : null;
  });
  expect(m, "inserted run found").toBeTruthy();
  expect(
    Math.abs(m!.b),
    `inserted text counter-rotated for the page (matrix=${JSON.stringify(m)})`,
  ).toBeGreaterThan(0.5);
});
