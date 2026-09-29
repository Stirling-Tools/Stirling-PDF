import { describe, expect, it } from "vitest";
import {
  buildExactLines,
  type CharPositions,
} from "@app/tools/pdfTextEditor/util/exactLayout";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";

/** Positions for `text` where every glyph advances by `advance` points. */
function uniform(text: string, advance = 10): CharPositions {
  const starts: number[] = [];
  const ends: number[] = [];
  let x = 0;
  for (const ch of text) {
    if (ch === "\n") {
      starts.push(Number.NaN);
      ends.push(Number.NaN);
      x = 0;
      continue;
    }
    starts.push(x);
    ends.push(x + advance);
    x += advance;
  }
  return { starts, ends };
}

describe("buildExactLines", () => {
  it("splits a line into word and space boxes at the captured advances", () => {
    const text = "ab cd";
    const lines = buildExactLines(text, uniform(text));
    expect(lines).toHaveLength(1);
    expect(lines?.[0].left).toBe(0);
    expect(lines?.[0].tokens).toEqual([
      { text: "ab", width: 20, space: false },
      { text: " ", width: 10, space: true },
      { text: "cd", width: 20, space: false },
    ]);
  });

  it("tiles boxes so each token starts at its own captured origin", () => {
    const text = "one two three";
    const positions = uniform(text);
    const lines = buildExactLines(text, positions);
    let x = lines?.[0].left ?? 0;
    let at = 0;
    for (const token of lines?.[0].tokens ?? []) {
      expect(x).toBeCloseTo(positions.starts[at], 6);
      x += token.width;
      at += token.text.length;
    }
  });

  it("preserves an uneven justification gap rather than averaging it", () => {
    // "a" then a wide gap then "b": the gap is the whole point of the capture.
    const positions: CharPositions = {
      starts: [0, 10, 60],
      ends: [10, 60, 70],
    };
    const lines = buildExactLines("a b", positions);
    expect(lines?.[0].tokens.map((t) => t.width)).toEqual([10, 50, 10]);
  });

  it("gives each line of a paragraph its own left origin", () => {
    const positions: CharPositions = {
      starts: [0, 10, Number.NaN, 40, 50],
      ends: [10, 20, Number.NaN, 50, 60],
    };
    const lines = buildExactLines("ab\ncd", positions);
    expect(lines).toHaveLength(2);
    expect(lines?.[0].left).toBe(0);
    expect(lines?.[1].left).toBe(40);
  });

  it("drops the engine-trimmed trailing spaces into a zero-width token", () => {
    const positions: CharPositions = {
      starts: [0, 10, Number.NaN],
      ends: [10, 20, Number.NaN],
    };
    const lines = buildExactLines("ab ", positions);
    expect(lines?.[0].tokens).toEqual([
      { text: "ab", width: 20, space: false },
      { text: " ", width: 0, space: true },
    ]);
  });

  it("keeps every character of the text, so innerText still round-trips", () => {
    const text = "hello there  friend\nsecond line";
    const lines = buildExactLines(text, uniform(text));
    const rebuilt = (lines ?? [])
      .map((line) => line.tokens.map((t) => t.text).join(""))
      .join("\n");
    expect(rebuilt).toBe(text);
  });

  it("derives a synthesised space's width from the gap the engine left", () => {
    // The grouper inserts this space between two separately-drawn words, so
    // it backs no glyph and has no captured position of its own.
    const positions: CharPositions = {
      starts: [0, 10, Number.NaN, 45, 55],
      ends: [10, 20, Number.NaN, 55, 65],
    };
    const lines = buildExactLines("ab cd", positions);
    expect(lines?.[0].tokens).toEqual([
      { text: "ab", width: 20, space: false },
      { text: " ", width: 25, space: true },
      { text: "cd", width: 20, space: false },
    ]);
  });

  it("still bails when a synthesised space has no word to measure against", () => {
    const positions: CharPositions = {
      starts: [0, 10, Number.NaN],
      ends: [10, 20, Number.NaN],
    };
    // Trailing spaces are trimmed, so put the unknown space mid-line with
    // nothing usable after it.
    expect(
      buildExactLines("ab x", {
        starts: [0, 10, Number.NaN, Number.NaN],
        ends: [10, 20, Number.NaN, Number.NaN],
      }),
    ).toBeNull();
    expect(buildExactLines("ab ", positions)).not.toBeNull();
  });

  it("returns null when a position is missing inside a word", () => {
    const positions: CharPositions = {
      starts: [0, Number.NaN, Number.NaN],
      ends: [10, Number.NaN, Number.NaN],
    };
    expect(buildExactLines("abc", positions)).toBeNull();
  });

  it("returns null when the capture does not match the text length", () => {
    expect(
      buildExactLines("abc", { starts: [0, 10], ends: [10, 20] }),
    ).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(buildExactLines("", { starts: [], ends: [] })).toBeNull();
  });

  it("returns null when positions run backwards", () => {
    const positions: CharPositions = { starts: [50, 10], ends: [60, 20] };
    expect(buildExactLines("ab", positions)).toBeNull();
  });
});

describe("capture validity", () => {
  const base = {
    id: "r1",
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text: "ab",
    fontId: "pdf:1:Helvetica",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  };

  function measured(): TextRun {
    const run = new TextRun({ ...base, pdfiumObjPtr: 1 });
    run.charStartsX = [0, 10];
    run.charEndsX = [10, 20];
    run.charPositionsKey = run.positionsKey();
    return run;
  }

  it("publishes the capture while the run is unchanged", () => {
    expect(measured().snapshot().charStartsX).toEqual([0, 10]);
  });

  it("drops the capture when the text changes", () => {
    const run = measured();
    run.text = "abc";
    expect(run.snapshot().charStartsX).toBeUndefined();
  });

  it("drops the capture when the size changes, which rescales every glyph", () => {
    const run = measured();
    run.fontSize = 24;
    expect(run.snapshot().charStartsX).toBeUndefined();
  });

  it("drops the capture when the family changes", () => {
    const run = measured();
    run.fontId = "base14:Times-Roman";
    expect(run.snapshot().charStartsX).toBeUndefined();
  });
});
