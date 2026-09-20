import { beforeEach, describe, expect, it } from "vitest";
import {
  findMatches,
  foldForSearch,
  replaceMatches,
} from "@app/tools/pdfTextEditor/util/textMatching";
import { fitTokenAdvance } from "@app/tools/pdfTextEditor/util/lineLayout";
import { HistoryStack } from "@app/tools/pdfTextEditor/store/HistoryStack";
import { everyCharIn } from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import { readOverlayText } from "@app/tools/pdfTextEditor/util/overlayPainter";

// Typing-path time budgets. Ceilings sit 10-50x above the measured means
// (Node 22 / jsdom, Sep 2026 sweep) so CI variance never trips them; they
// exist to catch algorithmic regressions (quadratic blowup, unbounded
// per-keystroke allocation), not to medal 5% wins.
const PARA =
  "The quick brown fox jumps over the lazy dog. Invoice #12345 total $678.90. ".repeat(
    20,
  );

function buildHost(lines: number, tokensPerLine: number): HTMLDivElement {
  const el = document.createElement("div");
  for (let l = 0; l < lines; l += 1) {
    const block = document.createElement("div");
    block.setAttribute("data-pdf-editor-line", String(l));
    for (let t = 0; t < tokensPerLine; t += 1) {
      const s = document.createElement("span");
      s.setAttribute("data-pdf-editor-token", "");
      s.textContent = `tok${t} `;
      block.appendChild(s);
    }
    el.appendChild(block);
  }
  document.body.replaceChildren(el);
  return el as HTMLDivElement;
}

describe("typing-path time budgets", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("folds and finds a 10KB run well inside a keystroke", () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i += 1) {
      foldForSearch(PARA, { matchCase: false });
      findMatches(PARA, "Invoice", {});
    }
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("replaces and fits without per-keystroke blowup", () => {
    const matches = findMatches(PARA, "Invoice", {});
    expect(matches.length).toBeGreaterThan(0);
    const t0 = performance.now();
    for (let i = 0; i < 200; i += 1) {
      replaceMatches(PARA, matches, "BILL");
      fitTokenAdvance(12, 96.5, 100.2, 16);
    }
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("coalesces a 100-key typing burst into one undo step, fast", () => {
    const doc = {} as never;
    const h = new HistoryStack(200);
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) {
      h.execute(
        {
          apply: () => {},
          revert: () => {},
          coalesceKey: () => "type:test",
        } as never,
        doc,
      );
    }
    while (h.canUndo) h.undo(doc);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(h.size().undo).toBe(0);
  });

  it("checks font reuse without pool-size blowup", () => {
    const pool = "The quick brown fox ".repeat(50);
    const t0 = performance.now();
    for (let i = 0; i < 200; i += 1) {
      everyCharIn(`${pool}x`, `${pool}xy`);
    }
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("reads a 50-line overlay back inside a keystroke", () => {
    const el = buildHost(50, 10);
    const t0 = performance.now();
    for (let i = 0; i < 50; i += 1) {
      readOverlayText(el);
    }
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
