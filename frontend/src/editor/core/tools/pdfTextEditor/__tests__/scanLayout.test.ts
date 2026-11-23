// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  layoutScanEdit,
  rewrapLines,
  type LayoutInput,
  type LayoutLine,
} from "@editor/tools/pdfTextEditor/commands/scanLayout";

// Two scanned lines of 5pt-per-char words, 4pt apart, 12pt between baselines.
function block(...texts: string[]): LayoutLine[] {
  return texts.map((t, line) => {
    let x = 10;
    return {
      baseline: 100 - line * 12,
      words: t.split(" ").map((text, index) => {
        const w = { line, index, text, x };
        x += text.length * 5 + 4;
        return w;
      }),
    };
  });
}

function run(
  lines: LayoutLine[],
  text: string,
  extra: Partial<LayoutInput> = {},
) {
  return layoutScanEdit({
    lines,
    text,
    pitch: 12,
    space: 4,
    wordWidth: (w) => w.text.length * 5,
    textWidth: (t) => t.length * 5,
    redraw: false,
    ...extra,
  });
}

describe("layoutScanEdit", () => {
  it("opens a gap for every extra space typed between kept words", () => {
    const l = run(block("NORTH HARBOUR CO"), "NORTH   HARBOUR CO");
    expect(l.kept.map((k) => k.x)).toEqual([10, 39 + 8, 78 + 8]);
  });

  it("keeps the extra spaces inside and before typed text", () => {
    const l = run(block("NORTH HARBOUR CO"), "NORTH  OLD  PIER HARBOUR CO");
    expect(l.typed.map((t) => [t.text, t.x])).toEqual([["OLD  PIER", 39 + 4]]);
  });

  it("does not move a word for spaces the scan's text already had", () => {
    const lines = block("NORTH HARBOUR CO");
    lines[0].words[1].lead = 2;
    const l = run(lines, "NORTH   HARBOUR CO");
    expect(l.kept.every((k) => !k.moved)).toBe(true);
  });

  it("draws a replaced word where it was when the scan already had its spaces", () => {
    const lines = block("NORTH HARBOUR CO");
    lines[0].words[1].lead = 2;
    lines[0].words[1].x += 8;
    const l = run(lines, "NORTH   BAY CO");
    expect(l.typed).toEqual([
      expect.objectContaining({ text: "BAY", x: lines[0].words[1].x }),
    ]);
  });

  it("starts a replaced first word where the scan's indented line starts", () => {
    const lines = block("NORTH HARBOUR");
    lines[0].words[0].lead = 2;
    const l = run(lines, "  SOUTH HARBOUR");
    expect(l.typed).toEqual([
      expect.objectContaining({ text: "SOUTH", x: lines[0].words[0].x }),
    ]);
  });

  it("keeps every word a typed word replaces", () => {
    const l = run(block("NORTH HARBOUR CO"), "NORTH BAY");
    expect(l.typed).toEqual([
      expect.objectContaining({
        text: "BAY",
        replaced: [
          expect.objectContaining({ text: "HARBOUR" }),
          expect.objectContaining({ text: "CO" }),
        ],
      }),
    ]);
  });

  it("measures no word on a line the edit left alone", () => {
    const measured: string[] = [];
    run(block("NORTH HARBOUR CO", "TEL 123"), "NORTH HARBOUR CO\nFAX 123", {
      wordWidth: (w) => {
        measured.push(w.text);
        return w.text.length * 5;
      },
    });
    expect(
      measured.filter((t) => ["NORTH", "HARBOUR", "CO"].includes(t)),
    ).toEqual([]);
  });

  it("leaves an unchanged block exactly as scanned", () => {
    const l = run(
      block("NORTH HARBOUR CO", "TEL 123"),
      "NORTH HARBOUR CO\nTEL 123",
    );
    expect(l.typed).toEqual([]);
    expect(l.removed).toEqual([]);
    expect(l.kept.every((k) => !k.moved)).toBe(true);
  });

  it("draws a replaced word where it was and pulls the rest of the line left", () => {
    const lines = block("NORTH HARBOUR TRADING CO");
    const l = run(lines, "NORTH BAY TRADING CO");
    expect(l.removed.map((w) => w.text)).toEqual(["HARBOUR"]);
    expect(l.typed).toEqual([
      expect.objectContaining({ text: "BAY", x: 39, atAnchor: true }),
    ]);
    const trading = l.kept.find((k) => k.word.text === "TRADING")!;
    // BAY is 20pt shorter than HARBOUR, so TRADING slides left by 20.
    expect(trading.moved).toBe(true);
    expect(trading.x).toBe(lines[0].words[2].x - 20);
    expect(l.kept.find((k) => k.word.text === "NORTH")!.moved).toBe(false);
  });

  it("pushes the rest of the line right when a word grows", () => {
    const lines = block("NORTH HARBOUR CO");
    const l = run(lines, "NORTH HARBOURS CO");
    const co = l.kept.find((k) => k.word.text === "CO")!;
    expect(co.x).toBe(lines[0].words[2].x + 5);
  });

  it("Enter moves the tail to a new line and pushes later lines down", () => {
    const lines = block("RIVERSIDE ROAD, EASTPORT", "TEL 123");
    const l = run(lines, "RIVERSIDE ROAD,\nEASTPORT\nTEL 123");
    const east = l.kept.find((k) => k.word.text === "EASTPORT")!;
    expect(east).toMatchObject({ x: 10, baseline: 88, moved: true });
    const tel = l.kept.find((k) => k.word.text === "TEL")!;
    expect(tel).toMatchObject({ x: 10, baseline: 76, moved: true });
  });

  it("deleting the first word pulls the line back to its start", () => {
    const l = run(block("NORTH HARBOUR CO"), "HARBOUR CO");
    expect(l.kept.find((k) => k.word.text === "HARBOUR")!.x).toBe(10);
  });

  it("typing at the end of a line draws after the last word", () => {
    const lines = block("TRADING CO");
    const l = run(lines, "TRADING CO LTD");
    expect(l.typed).toEqual([
      expect.objectContaining({ text: "LTD", x: lines[0].words[1].x + 10 + 4 }),
    ]);
    expect(l.kept.every((k) => !k.moved)).toBe(true);
  });

  it("typing at the end of a line draws past text already drawn there", () => {
    const lines = block("TRADING CO");
    const coEnd = lines[0].words[1].x + 10;
    const earlier = { line: 0, x: coEnd + 4, right: coEnd + 4 + 15 };
    const l = run(lines, "TRADING CO LTD", { obstacles: [earlier] });
    expect(l.typed).toEqual([
      expect.objectContaining({ text: "LTD", x: earlier.right + 4 }),
    ]);
  });

  it("a restyle redraws every word as text", () => {
    const l = run(block("NORTH CO", "TEL 1"), "NORTH CO\nTEL 1", {
      redraw: true,
    });
    expect(l.kept).toEqual([]);
    expect(l.removed).toHaveLength(4);
    expect(l.typed.map((t) => t.text)).toEqual(["NORTH CO", "TEL 1"]);
  });
});

describe("rewrapLines", () => {
  const upTo = (n: number) => (line: string) => line.length <= n;

  it("moves the words that overflow to the front of the next line", () => {
    expect(rewrapLines("one two three four\nfive", upTo(13), false)).toBe(
      "one two three\nfour five",
    );
  });

  it("keeps every character at its offset", () => {
    const text = "one two three four\nfive six seven\neight";
    const wrapped = rewrapLines(text, upTo(13), true);
    expect(wrapped.replace(/\n/g, " ")).toBe(text.replace(/\n/g, " "));
    expect(wrapped.split("\n").every((l) => l.trim().length <= 13)).toBe(true);
  });

  it("adds a line under the last one only when there is room", () => {
    expect(rewrapLines("one two three four", upTo(13), true)).toBe(
      "one two three\nfour",
    );
    expect(rewrapLines("one two three four", upTo(13), false)).toBe(
      "one two three four",
    );
  });

  it("does not pull a paragraph break into the line above", () => {
    expect(rewrapLines("one two three four\n\nfive", upTo(13), true)).toBe(
      "one two three\nfour\n\nfive",
    );
  });

  it("leaves a single word that cannot fit, and text that already fits", () => {
    expect(rewrapLines("incomprehensibilities", upTo(5), true)).toBe(
      "incomprehensibilities",
    );
    expect(rewrapLines("one two\nthree", upTo(13), true)).toBe(
      "one two\nthree",
    );
  });
});
