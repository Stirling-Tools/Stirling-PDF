// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  endsWithSpace,
  groupWords,
  type WordLeaf,
} from "@app/tools/pdfTextEditor/util/wordGrouping";

const FONT_SIZE = 20;
const GLYPH_WIDTH = 10;

/** Lay `text` out one object per character, `gap` points between glyphs. */
function perGlyph(
  text: string,
  gap: number,
  wordGap: number,
  baseline = 100,
): WordLeaf[] {
  const leaves: WordLeaf[] = [];
  let x = 0;
  for (const ch of text) {
    if (ch === " " && wordGap >= 0) {
      x += wordGap - gap;
      continue;
    }
    leaves.push({ text: ch, x, right: x + GLYPH_WIDTH, baseline });
    x += GLYPH_WIDTH + gap;
  }
  return leaves;
}

const wordTexts = (leaves: WordLeaf[]) =>
  groupWords(leaves, FONT_SIZE).map((w) =>
    w.glyphs.map((g) => g.text).join(""),
  );

describe("groupWords", () => {
  it("keeps a letter-spaced heading's words whole", () => {
    // Tracking of 0.4em is wider than the fixed word-gap threshold, which is
    // what used to turn every glyph into its own word.
    const tracking = FONT_SIZE * 0.4;
    const leaves = perGlyph(
      "Open Source",
      tracking,
      tracking + FONT_SIZE * 0.3,
    );
    expect(wordTexts(leaves)).toEqual(["Open", "Source"]);
  });

  it("splits a letter-spaced heading at a real space glyph", () => {
    const tracking = FONT_SIZE * 0.4;
    const leaves = perGlyph("Open Source", tracking, -1);
    const words = groupWords(leaves, FONT_SIZE);
    expect(words.map((w) => w.glyphs.map((g) => g.text).join(""))).toEqual([
      "Open ",
      "Source",
    ]);
    expect(endsWithSpace(words[0])).toBe(true);
    expect(endsWithSpace(words[1])).toBe(false);
  });

  it("splits untracked per-glyph text at word gaps", () => {
    const leaves = perGlyph("carry out various", 0, FONT_SIZE * 0.25);
    expect(wordTexts(leaves)).toEqual(["carry", "out", "various"]);
  });

  it("splits a short tracked line at its word gap", () => {
    // Two gap samples, 8pt tracking and a 14pt word gap: an upper median
    // would take 14 as the tracking and merge "I" into "am".
    const leaves = perGlyph("I am", 8, 14);
    expect(wordTexts(leaves)).toEqual(["I", "am"]);
  });

  it("keeps tightly kerned glyphs together", () => {
    const leaves = perGlyph("AVATAR", -1.5, FONT_SIZE * 0.25);
    expect(wordTexts(leaves)).toEqual(["AVATAR"]);
  });

  it("treats word-sized objects separated by spaces as words", () => {
    const leaves: WordLeaf[] = [
      { text: "Hello", x: 0, right: 50, baseline: 100 },
      { text: "world", x: 55, right: 105, baseline: 100 },
    ];
    expect(wordTexts(leaves)).toEqual(["Hello", "world"]);
  });

  it("splits a word that continues onto the next line", () => {
    const leaves = [
      ...perGlyph("ab", 0, FONT_SIZE * 0.25, 100),
      ...perGlyph("cd", 0, FONT_SIZE * 0.25, 76),
    ];
    expect(wordTexts(leaves)).toEqual(["ab", "cd"]);
  });
});
