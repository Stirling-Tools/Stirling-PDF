import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";

/**
 * Client-side Unicode fallback font (Noto Sans, embedded on demand).
 *
 * Base-14 PDF fonts only cover Latin-1, so editing/inserting text with Cyrillic
 * etc. used to silently DROP those glyphs. The editor now embeds Noto Sans via
 * FPDFText_LoadFont so they survive a save+reopen round-trip.
 *
 * Backend-free: encode-charcodes is aborted, so the edit takes the base-14
 * re-emit path where the fallback kicks in.
 */

const SAMPLE = path.join(__dirname, "../../../../public/samples/Sample.pdf");
const CYRILLIC = "Привет";

async function gotoEditor(page: Page): Promise<Promise<unknown>> {
  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  // Capture the fallback-font fetch (fired on mount) so we can await it before
  // editing - the embed is sync and needs the bytes cached.
  const fontLoaded = page
    .waitForResponse((r) => /NotoSans-Regular\.ttf/.test(r.url()), {
      timeout: 20_000,
    })
    .catch(() => null);
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  return fontLoaded;
}

test("non-Latin text survives a save+reopen via the embedded fallback font", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  const fontLoaded = await gotoEditor(page);
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await fontLoaded; // bytes cached before we edit
  await page.waitForTimeout(400);

  // Append Cyrillic to the first run and commit (blur).
  const id = await page.evaluate(() => {
    const s = (window as any).__v2_editor_store;
    return s.doc.page(0).runs[0]?.id ?? null;
  });
  expect(id, "page 0 has at least one run").toBeTruthy();

  await page.evaluate(
    ({ rid, text }: { rid: string; text: string }) => {
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
      document.execCommand("insertText", false, " " + text);
    },
    { rid: id as string, text: CYRILLIC },
  );
  await page.waitForTimeout(200);
  await page.evaluate((rid: string) => {
    document
      .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
      ?.blur();
  }, id as string);
  await page.waitForTimeout(1000);

  // Save, then reopen the produced bytes.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("v2-save").click();
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const saved = Buffer.concat(chunks);

  await page.locator('[data-testid="v2-file-input"]').setInputFiles({
    name: "round-trip.pdf",
    mimeType: "application/pdf",
    buffer: saved,
  });
  await expect(page.locator('[data-testid^="v2-run-p0-"]').first()).toBeVisible(
    { timeout: 30_000 },
  );
  await page.waitForTimeout(500);

  // The reopened document must still carry the Cyrillic (embedded, not dropped).
  const reopened = await page.evaluate(() => {
    const s = (window as any).__v2_editor_store;
    return s.doc
      .page(0)
      .runs.map((r: any) => r.text)
      .join("");
  });
  expect(reopened).toContain(CYRILLIC);
  expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
});
