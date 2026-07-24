import { describe, it, expect } from "vitest";
import {
  planParagraphEdit,
  planPartialEdit,
} from "@app/tools/pdfTextEditor/v2/commands/partialEdit";
import {
  TextRun,
  type ParagraphLineSlot,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";

/**
 * Regression coverage for the mushroom-life.pdf "line collapse" bug.
 *
 * A paragraph's `run.text` joins VISUAL lines with one-char separators:
 * "\n" for hard (user) breaks, " " for soft word-wraps. `planParagraphEdit`
 * used to derive its per-line view via `run.text.split("\n")`, which
 * UNDER-COUNTS lines the moment a paragraph soft-wraps - then bailed on
 * `prevLines.length !== paragraphLineSlots.length`, routing the edit to the
 * whole-paragraph overlay re-emit which collapsed every visual line onto a
 * single baseline.
 *
 * The fix derives per-line text from the slot CHAR RANGES instead, so a
 * soft-wrapped paragraph edits in place (font-preserving) like any other.
 */

let nextPtr = 100;
function slot(
  text: string,
  startChar: number,
  baselineY: number,
): ParagraphLineSlot {
  const ptr = nextPtr++;
  return {
    startChar,
    endChar: startChar + text.length,
    baselineY,
    matrixE: 0,
    containerPtr: 0,
    fontId: "pdf:1:LMRoman12",
    fontSize: 12,
    fontSubset: false,
    mergedFromPtrs: [ptr],
    mergedFromTexts: [text],
    mergedFromBounds: [{ x: 0, right: text.length * 6 }],
    mergedFromCharStarts: [0],
  };
}

/**
 * Build a paragraph run whose `text` is the visual lines joined by the
 * given separators (one per gap, "\n" or " ").
 */
function makeParagraph(lines: string[], separators: string[]): TextRun {
  let text = lines[0];
  const slots: ParagraphLineSlot[] = [slot(lines[0], 0, 800)];
  let cursor = lines[0].length;
  for (let i = 1; i < lines.length; i++) {
    text += separators[i - 1] + lines[i];
    cursor += 1; // separator
    slots.push(slot(lines[i], cursor, 800 - i * 14));
    cursor += lines[i].length;
  }
  const run = new TextRun({
    id: "p0-t0",
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 800 },
    text,
    fontId: "pdf:1:LMRoman12",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: 0,
  });
  run.paragraphLineSlots = slots;
  run.paragraphLineHeight = 14;
  return run;
}

/**
 * Build a single-sub-run TextRun whose own `mergedFrom*` arrays carry `text`
 * as one object - the shape `planPartialEdit` diffs against. Used to exercise
 * the surrogate-pair bailout directly.
 */
function makeSingleSubRun(text: string): TextRun {
  const run = new TextRun({
    id: "p0-t0",
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: text.length * 6, height: 14 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 800 },
    text,
    fontId: "pdf:1:LMRoman12",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: 0,
  });
  run.mergedFromPtrs = [200];
  run.mergedFromTexts = [text];
  run.mergedFromBounds = [{ x: 0, right: text.length * 6 }];
  run.mergedFromCharStarts = [0];
  return run;
}

describe("planPartialEdit surrogate-pair guard (astral chars)", () => {
  it("bails (returns null) when prevText already contains an emoji surrogate pair", () => {
    // "🎉" is two UTF-16 code units; the LCS indexes by code unit, so an
    // existing astral char could split across keep/drop and emit a lone
    // surrogate. The guard at partialEdit.ts must null the plan instead.
    const run = makeSingleSubRun("🎉ab");
    expect(planPartialEdit(run, "🎉ab", "🎉abc")).toBeNull();
  });

  it("returns a non-null plan for the same edit when prevText has NO surrogate", () => {
    // Identical append, but an ASCII anchor instead of the emoji - proves the
    // guard is specific to surrogate pairs and not a blanket bailout.
    const run = makeSingleSubRun("Xab");
    expect(planPartialEdit(run, "Xab", "Xabc")).not.toBeNull();
  });
});

describe("planParagraphEdit slot-range line mapping", () => {
  it("does NOT bail on a soft-wrapped paragraph (the collapse bug)", () => {
    // 4 visual lines, but only ONE hard break: "aaa bbb\nccc ddd".
    // split("\n") => 2 segments, slots => 4. The old guard bailed here.
    const run = makeParagraph(["aaa", "bbb", "ccc", "ddd"], [" ", "\n", " "]);
    const prev = run.text;
    expect(prev).toBe("aaa bbb\nccc ddd");
    const next = "Zaaa bbb\nccc ddd"; // insert "Z" at the very start

    const plan = planParagraphEdit(run, prev, next);
    expect(plan).not.toBeNull();
    // Per-visual-line next text, slot-aligned (NOT \n-split).
    expect(plan?.nextLines).toEqual(["Zaaa", "bbb", "ccc", "ddd"]);
    // Only the hit slot (line 0) is in the per-slot edit list.
    expect(plan?.perSlot.map((p) => p.slotIdx)).toEqual([0]);
  });

  it("maps an edit confined to a later soft-wrapped line to the right slot", () => {
    const run = makeParagraph(["aaa", "bbb", "ccc", "ddd"], [" ", "\n", " "]);
    const prev = run.text; // "aaa bbb\nccc ddd"
    // Insert "X" at the start of the last visual line ("ddd" -> "Xddd").
    const next = "aaa bbb\nccc Xddd";
    const plan = planParagraphEdit(run, prev, next);
    expect(plan).not.toBeNull();
    expect(plan?.nextLines).toEqual(["aaa", "bbb", "ccc", "Xddd"]);
    expect(plan?.perSlot.map((p) => p.slotIdx)).toEqual([3]);
  });

  it("bails when the edit changes the hard-break count (structural)", () => {
    const run = makeParagraph(["aaa", "bbb", "ccc", "ddd"], [" ", "\n", " "]);
    const prev = run.text;
    // Type Enter inside the first line -> a NEW hard break.
    const next = "aa\na bbb\nccc ddd";
    expect(planParagraphEdit(run, prev, next)).toBeNull();
  });

  it("bails when the edit spans a soft-wrap separator (two slots)", () => {
    const run = makeParagraph(["aaa", "bbb", "ccc", "ddd"], [" ", "\n", " "]);
    const prev = run.text; // "aaa bbb\nccc ddd"
    // Delete the soft-wrap space between "ccc" and "ddd" (merges two slots).
    const next = "aaa bbb\ncccddd";
    expect(planParagraphEdit(run, prev, next)).toBeNull();
  });

  it("bails when slot ranges don't tile run.text (desynced model)", () => {
    const run = makeParagraph(["aaa", "bbb"], ["\n"]);
    // Corrupt run.text so the slot ranges no longer tile it.
    run.text = "aaa bbb EXTRA";
    expect(planParagraphEdit(run, run.text, "Zaaa bbb EXTRA")).toBeNull();
  });

  it("forces a fresh word-split re-emit when a mid-line edit would SetText whitespace (the „ bug)", () => {
    // A whole line as ONE sub-run carrying spaces (LaTeX one-object-per-line).
    // A mid-line edit makes planPartialEdit a "modify" op whose surviving text
    // still has spaces - SetText-ing that onto a no-space-glyph subset font
    // paints „. planParagraphEdit must null the slot plan so the apply step
    // re-emits the line word-split (spaces become positional gaps) instead.
    const run = makeParagraph(["aaa bbb ccc", "ddd eee"], ["\n"]);
    const prev = run.text; // "aaa bbb ccc\nddd eee"
    const next = "aaa Xbb ccc\nddd eee"; // replace one char mid-line-0
    const plan = planParagraphEdit(run, prev, next);
    expect(plan).not.toBeNull();
    const entry = plan?.perSlot.find((p) => p.slotIdx === 0);
    expect(entry).toBeDefined();
    // null plan => the apply step fresh-emits this line (word-split), avoiding „.
    expect(entry?.plan).toBeNull();
    expect(entry?.nextLine).toBe("aaa Xbb ccc");
  });

  it("keeps the in-place modify fast path for a single-word sub-run (no whitespace)", () => {
    // Per-word sub-runs (no spaces inside any one) keep the surgical modify
    // path - only multi-word single objects need the word-split re-emit.
    const run = makeParagraph(["hello", "world"], ["\n"]);
    const prev = run.text; // "hello\nworld"
    const next = "hello\nworXd";
    const plan = planParagraphEdit(run, prev, next);
    expect(plan).not.toBeNull();
    const entry = plan?.perSlot.find((p) => p.slotIdx === 1);
    // A non-null plan => surgical in-place edit kept (sub-run has no spaces).
    expect(entry?.plan).not.toBeNull();
  });

  it("handles an all-hard-break paragraph (initial-load shape) too", () => {
    // Every visual line a hard break: this is the shape ParagraphGrouper
    // builds at load. split("\n") == slots here, so it always worked - pin
    // it so the slot-range path stays equivalent for the common case.
    const run = makeParagraph(["one", "two", "three"], ["\n", "\n"]);
    const prev = run.text;
    expect(prev).toBe("one\ntwo\nthree");
    const next = "one\ntwoX\nthree";
    const plan = planParagraphEdit(run, prev, next);
    expect(plan).not.toBeNull();
    expect(plan?.nextLines).toEqual(["one", "twoX", "three"]);
    expect(plan?.perSlot.map((p) => p.slotIdx)).toEqual([1]);
  });
});
