import { describe, expect, it } from "vitest";
import {
  layoutScanEdit,
  type LayoutInput,
  type LayoutLine,
} from "@app/tools/pdfTextEditor/commands/scanLayout";

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

  it("a restyle redraws every word as text", () => {
    const l = run(block("NORTH CO", "TEL 1"), "NORTH CO\nTEL 1", {
      redraw: true,
    });
    expect(l.kept).toEqual([]);
    expect(l.removed).toHaveLength(4);
    expect(l.typed.map((t) => t.text)).toEqual(["NORTH CO", "TEL 1"]);
  });
});
