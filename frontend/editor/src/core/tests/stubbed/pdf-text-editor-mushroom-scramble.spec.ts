import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Route } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

/** Regression for the mushroom-life.pdf "paragraph scramble" report. */

const MUSHROOM = path.join(
  import.meta.dirname,
  "../test-fixtures/mushroom-life.pdf",
);

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
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(MUSHROOM);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);

  const probe = () =>
    page.evaluate(() => {
      const s = (window as unknown as EditorTestWindow).__editor_store;
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
  await page.locator(`[data-testid="pdf-editor-run-${id}"]`).click();
  await page.waitForTimeout(400);
  await page.evaluate((rid) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="pdf-editor-run-${rid}"]`,
    );
    if (!el) throw new Error("overlay missing");
    el.focus();
    // The overlay may render words in boxes, so the editable's first
    // child is not necessarily the text node holding character N.
    const at = (offset: number): { node: Node; offset: number } => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let seen = 0;
      let node = walker.nextNode();
      while (node) {
        const len = (node.textContent ?? "").length;
        if (seen + len >= offset) return { node, offset: offset - seen };
        seen += len;
        node = walker.nextNode();
      }
      return { node: el, offset: 0 };
    };
    const len = (el.textContent ?? "").length;
    const sel = window.getSelection()!;
    const range = document.createRange();
    const start = at(Math.min(5, len));
    const end = at(Math.min(20, len)); // "ooms represent " - has spaces
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, "X");
  }, id);
  await page.waitForTimeout(250);
  await page.evaluate(
    (rid) =>
      document
        .querySelector<HTMLElement>(`[data-testid="pdf-editor-run-${rid}"]`)
        ?.blur(),
    id,
  );
  await page.waitForTimeout(1200);

  // The model text reflects the RENDERED glyphs after the blur reflow re-reads
  // the page.
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
