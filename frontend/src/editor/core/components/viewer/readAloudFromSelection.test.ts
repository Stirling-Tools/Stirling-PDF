// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { PdfPageGeometry } from "@embedpdf/models";
import {
  findReadAloudStartIndex,
  glyphPositionRatio,
} from "@editor/components/viewer/readAloudFromSelection";

describe("findReadAloudStartIndex", () => {
  const text = "The cat sat. The dog ran. The end";

  it("finds the selection in the page text", () => {
    expect(findReadAloudStartIndex(text, "dog ran", 0)).toBe(17);
  });

  it("picks the repeated match nearest the selection's position", () => {
    expect(findReadAloudStartIndex(text, "The", 0)).toBe(0);
    expect(findReadAloudStartIndex(text, "The", 0.45)).toBe(13);
    expect(findReadAloudStartIndex(text, "The", 1)).toBe(26);
  });

  it("prefers a whole word over a nearer match inside a longer word", () => {
    expect(findReadAloudStartIndex("concatenate cat", "cat", 0)).toBe(12);
  });

  it("snaps a selection starting mid-word to the word start", () => {
    expect(findReadAloudStartIndex(text, "og ran", 0)).toBe(17);
  });

  it("falls back to the first word when spacing differs", () => {
    expect(findReadAloudStartIndex(text, "dog\nran   fast", 0)).toBe(17);
  });

  it("starts at the page start when the selection is not found", () => {
    expect(findReadAloudStartIndex(text, "bird", 0.5)).toBe(0);
    expect(findReadAloudStartIndex(text, "", 0.5)).toBe(0);
  });
});

describe("glyphPositionRatio", () => {
  const run = (charStart: number, glyphCount: number) => ({
    rect: { x: 0, y: 0, width: 0, height: 0 },
    charStart,
    glyphs: Array.from({ length: glyphCount }, () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      flags: 0,
    })),
  });

  it("divides the glyph index by the page's glyph count", () => {
    const geometry: PdfPageGeometry = { runs: [run(0, 50), run(50, 50)] };
    expect(glyphPositionRatio(geometry, 25)).toBe(0.25);
  });

  it("is 0 without geometry", () => {
    expect(glyphPositionRatio(undefined, 25)).toBe(0);
  });
});
