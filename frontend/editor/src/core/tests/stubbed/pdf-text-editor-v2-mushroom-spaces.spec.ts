import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Route } from "@playwright/test";
import path from "path";

/**
 * Regression for the mushroom-life.pdf reports (backend charcode strategy):
 *
 *   1. Editing inserted „ (U+201E) where spaces should be. The LMRoman subset
 *      font has no space glyph but encode(" ") returns charcode 0x20, which
 *      SetCharcodes paints as the quotedblbase glyph at that subset code.
 *   2. Continuous edits collapsed the paragraph onto one baseline on blur.
 *
 * This test stubs the encode-charcodes endpoint with a DELIBERATELY BUGGY
 * backend that hands back a charcode for EVERY char including whitespace
 * (0x20 for a space - exactly the old behaviour). The fixed frontend must
 * never reuse whitespace anyway: the resolver, prewarm and word-splitter all
 * refuse it, so no emit event ever resolves more charcodes than it has
 * non-whitespace chars, and the paragraph keeps all its lines.
 */

const MUSHROOM = path.join(__dirname, "../test-fixtures/mushroom-life.pdf");

interface CharcodeEvent {
  text: string;
  outcome: string;
  resolved: number[];
}

test("mushroom first-line edits never reuse whitespace (no „) and keep the paragraph lines", async ({
  page,
}) => {
  // BUGGY backend: returns a charcode for every code point, even whitespace
  // (space -> 0x20). The frontend must still refuse to reuse it.
  await page.route("**/encode-charcodes", (route: Route) => {
    let text = "";
    try {
      text = (route.request().postDataJSON() as { text?: string }).text ?? "";
    } catch {
      /* ignore */
    }
    const charcodes = Array.from(text).map((ch) => ch.codePointAt(0) ?? 0);
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ charcodes, missing: [] }),
    });
  });

  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  await page.goto("/pdf-text-editor?charcodeStrategy=backend", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(MUSHROOM);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  const probe = () =>
    page.evaluate(() => {
      const s = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  paragraphLineSlots?: unknown[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const pg = s.doc.page(0);
      const r =
        pg.runs.find((x) => (x.paragraphLineSlots?.length ?? 0) > 1) ??
        pg.runs[0];
      return {
        id: r?.id,
        lineCount: r?.paragraphLineSlots?.length ?? 0,
        text: (r?.text ?? "").slice(0, 200),
        hasLowQuote: (r?.text ?? "").includes("„"),
      };
    });

  const before = await probe();
  expect(before.lineCount).toBeGreaterThan(1);
  const id = before.id;

  // Focus engages the backend prewarm; wait for it to complete so the cache
  // is populated before the first keystroke.
  const prewarm = page.waitForEvent("console", {
    predicate: (m) =>
      /\[v2\.charcode\] backend prewarm pageIdx=/.test(m.text()),
    timeout: 30_000,
  });
  await page.locator(`[data-testid="v2-run-${id}"]`).click();
  await prewarm.catch(() => undefined);

  // MID-LINE replace: select a span that spans several words (so it includes
  // spaces) and replace it. This forces the whole-line sub-run (one PDFium
  // object covering many words) to be re-emitted - the exact path that used
  // to SetText whitespace onto the no-space-glyph subset font and paint „.
  await page.evaluate((rid) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${rid}"]`,
    );
    if (!el) return;
    el.focus();
    const tn = el.firstChild ?? el;
    const len = (tn.textContent ?? "").length;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(tn, Math.min(5, len));
    range.setEnd(tn, Math.min(20, len)); // "ooms represent " - has spaces
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, "X");
  }, id);
  await page.waitForTimeout(200);
  await page.evaluate(
    (rid) =>
      document
        .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
        ?.blur(),
    id,
  );
  await page.waitForTimeout(1000);

  const after = await probe();

  expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
  // No „ in the model text - spaces survived as real gaps, not the
  // quotedblbase glyph at subset code 0x20.
  expect(after.hasLowQuote).toBe(false);
  // Paragraph kept its lines - no collapse onto a single baseline.
  expect(after.lineCount).toBeGreaterThan(1);

  // Decisive: no emit event ever resolved MORE charcodes than it had
  // non-whitespace chars - i.e. whitespace was never charcode-reused (which
  // is what painted „), even though the stubbed backend offered a code for it.
  const events: CharcodeEvent[] = await page.evaluate(
    () =>
      (window as unknown as { __v2_charcode_events?: CharcodeEvent[] })
        .__v2_charcode_events ?? [],
  );
  const whitespaceReused = events.filter((e) => {
    const nonWs = Array.from(e.text).filter((c) => !/\s/.test(c)).length;
    return (e.resolved?.length ?? 0) > nonWs;
  });
  expect(
    whitespaceReused,
    `whitespace must never be charcode-reused. Offending:\n${JSON.stringify(whitespaceReused, null, 2)}`,
  ).toHaveLength(0);
});
