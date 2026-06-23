import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Route } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/**
 * Regression for the mushroom-life.pdf "paragraph scramble" report.
 *
 * Body lines in this PDF are each ONE PDFium text object in a NON-SUBSET
 * LMRoman font. A mid-line edit forces the whole line to be re-emitted
 * (planParagraphEdit nulls the slot plan to avoid SetText-ing whitespace).
 * With a cold/offline backend the emit path used to fall back to the
 * client-side content-stream resolver, which GUESSES each glyph's charcode
 * by its sequential order on the page - correct for many subset fonts but
 * WRONG for this re-encoded font. The wrong-but-valid glyphs (e.g.
 * "occupying" -> "Λffff´`ˇΘΞΩ", "a" -> "fi") passed the advance self-check
 * and scrambled every unchanged word on the edited line.
 *
 * The fix gates the content-stream guess to SUBSET fonts + SINGLE code
 * points. A non-subset font now re-emits via FPDFText_SetText (whose reverse
 * Unicode->charcode lookup is correct for non-subset fonts), so the line's
 * unchanged words keep their real glyphs - readable, font preserved.
 */

const MUSHROOM = path.join(__dirname, "../test-fixtures/mushroom-life.pdf");

test("mid-line paragraph edit does not scramble unchanged words (cold backend, non-subset font)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Offline backend: every encode-charcodes call fails, so the emit path hits
  // the cold-cache fallback - the exact condition that used to scramble.
  await page.route("**/encode-charcodes", (route: Route) => route.abort());

  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  await page.goto("/pdf-text-editor?charcodeStrategy=backend", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(MUSHROOM);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  const probe = () =>
    page.evaluate(() => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      const pg = s.doc.page(0);
      const r =
        pg.runs.find((x) => (x.paragraphLineSlots?.length ?? 0) > 1) ??
        pg.runs[0];
      return {
        id: r?.id as string,
        fontSubset: r?.fontSubset as boolean,
        lineCount: r?.paragraphLineSlots?.length ?? 0,
        firstLine: (r?.text ?? "").split("\n")[0] as string,
      };
    });

  const before = await probe();
  // Sanity: a multi-line paragraph in a non-subset font (the scramble setup).
  expect(before.lineCount).toBeGreaterThan(1);
  expect(before.fontSubset).toBe(false);
  expect(before.firstLine).toContain("fascinating");
  const id = before.id;

  // Mid-line replace spanning several words (so it spans spaces) -> forces the
  // whole one-object line to be re-emitted, the path that used to scramble.
  await page.locator(`[data-testid="v2-run-${id}"]`).click();
  await page.waitForTimeout(400);
  await page.evaluate((rid) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${rid}"]`,
    );
    if (!el) throw new Error("overlay missing");
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
  await page.waitForTimeout(250);
  await page.evaluate(
    (rid) =>
      document
        .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
        ?.blur(),
    id,
  );
  await page.waitForTimeout(1200);

  // The model text reflects the RENDERED glyphs after the blur reflow re-reads
  // the page - so a scramble would surface here as garbage glyphs in place of
  // the unchanged words. After the fix the words past the edit are intact.
  const after = await probe();
  const firstLine = after.firstLine;

  expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
  // Words AFTER the edited span are unchanged and must render correctly - the
  // exact words the content-stream guess used to scramble.
  for (const word of ["fascinating", "organisms", "occupying", "unique"]) {
    expect(
      firstLine,
      `unchanged word "${word}" must survive the re-emit (no scramble). Got: ${JSON.stringify(firstLine)}`,
    ).toContain(word);
  }
  // And the edit itself applied (the replaced span collapsed to "X").
  expect(firstLine).toContain("MushrX");
});
