import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Route } from "@playwright/test";
import path from "path";

// Regression for the mushroom-life.pdf reports (backend charcode strategy): 1.

const MUSHROOM = path.join(
  import.meta.dirname,
  "../test-fixtures/mushroom-life.pdf",
);

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
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(MUSHROOM);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1000);

  const probe = () =>
    page.evaluate(() => {
      const s = (
        window as unknown as {
          __editor_store: {
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
      ).__editor_store;
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
    predicate: (m) => /\[charcode\] backend prewarm pageIdx=/.test(m.text()),
    timeout: 30_000,
  });
  await page.locator(`[data-testid="pdf-editor-run-${id}"]`).click();
  await prewarm.catch(() => undefined);

  // MID-LINE replace: select a span that spans several words (so it includes
  // spaces) and replace it.
  await page.evaluate((rid) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="pdf-editor-run-${rid}"]`,
    );
    if (!el) return;
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
  await page.waitForTimeout(200);
  await page.evaluate(
    (rid) =>
      document
        .querySelector<HTMLElement>(`[data-testid="pdf-editor-run-${rid}"]`)
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
  // non-whitespace chars.
  const events: CharcodeEvent[] = await page.evaluate(
    () =>
      (window as unknown as { __charcode_events?: CharcodeEvent[] })
        .__charcode_events ?? [],
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
