import { describe, expect, test } from "vitest";
import {
  buildGlyphAtlas,
  composeText,
  type ScannedWord,
} from "@editor/tools/pdfTextEditor/commands/scanGlyphs";

const SCALE = 4;
const HEIGHT = 40;
const DESCENT = 2;
const BASE_ROW = HEIGHT - DESCENT * SCALE;

interface Letter {
  width: number;
  top: number;
  bottom: number;
}

const X: Letter = { width: 8, top: 12, bottom: 0 };

const widthOf = (ch: string) =>
  /[il]/.test(ch) ? 3 : /[mw]/.test(ch) ? 14 : /[A-Z]/.test(ch) ? 12 : 8;

const letterOf = (ch: string): Letter => ({
  width: widthOf(ch),
  top: /[A-Z0-9]/.test(ch) ? 17 : /[bdfhijkl]/.test(ch) ? 18 : 12,
  bottom: 0,
});

function scanned(
  text: string,
  place: (i: number, letter: Letter) => number,
  overrides: Record<number, Letter> = {},
): ScannedWord {
  const letters = [...text].map((ch, i) => overrides[i] ?? letterOf(ch));
  const lefts = letters.map((l, i) => place(i, l));
  const width = Math.max(...letters.map((l, i) => lefts[i] + l.width)) + 4;
  const rgba = new Uint8Array(width * HEIGHT * 4);
  letters.forEach((l, i) => {
    for (let y = BASE_ROW - l.top; y < BASE_ROW - l.bottom; y++)
      for (let x = lefts[i]; x < lefts[i] + l.width; x++)
        rgba[(y * width + x) * 4 + 3] = 255;
  });
  return {
    text,
    rgba,
    width,
    height: HEIGHT,
    left: 0,
    scale: SCALE,
    spans: letters.map((l, i) => ({
      left: lefts[i] / SCALE,
      right: (lefts[i] + l.width) / SCALE,
    })),
  };
}

const proportional = (text: string, overrides: Record<number, Letter> = {}) => {
  const widths = [...text].map((ch, i) => (overrides[i] ?? letterOf(ch)).width);
  return scanned(
    text,
    (i) => 3 + widths.slice(0, i).reduce((p, q) => p + q + 3, 0),
    overrides,
  );
};

const CELL = 20;
const typewritten = (text: string) =>
  scanned(text, (i, l) => 3 + i * CELL + Math.round((CELL - l.width) / 2));

const inkWidth = (glyphs: { inkLeft: number; inkRight: number } | null) =>
  glyphs ? glyphs.inkRight - glyphs.inkLeft : null;

describe("building the atlas from the scan's letters", () => {
  test("drops a letter whose ink is taller than the OCR's reading allows", () => {
    const atlas = buildGlyphAtlas(
      [
        proportional("nonce"),
        proportional("ce", { 1: { width: 8, top: 18, bottom: 0 } }),
      ],
      DESCENT,
    )!;
    expect(composeText(atlas, "e", 0)).not.toBeNull();
    const accentOnly = buildGlyphAtlas(
      [
        proportional("noun"),
        proportional("ce", { 1: { width: 8, top: 18, bottom: 0 } }),
      ],
      DESCENT,
    )!;
    expect(composeText(accentOnly, "e", 0)).toBeNull();
    expect(composeText(accentOnly, "on", 0)).not.toBeNull();
  });

  test("never pastes a capital the OCR read as lowercase", () => {
    const atlas = buildGlyphAtlas(
      [
        proportional("moon"),
        proportional("oxford", { 0: { width: 12, top: 17, bottom: 0 } }),
      ],
      DESCENT,
    )!;
    expect(inkWidth(composeText(atlas, "o", 0))).toBe(X.width);
  });

  test("drops a letter whose ink hangs below the baseline it should sit on", () => {
    const atlas = buildGlyphAtlas(
      [
        proportional("noun"),
        proportional("aca", { 1: { width: 8, top: 12, bottom: -6 } }),
      ],
      DESCENT,
    )!;
    expect(composeText(atlas, "c", 0)).toBeNull();
    expect(composeText(atlas, "a", 0)).not.toBeNull();
  });
});

describe("spacing letters taken from the scan", () => {
  test("keeps typewriter letters on the scan's character pitch", () => {
    const atlas = buildGlyphAtlas(
      [typewritten("illicit"), typewritten("minimum")],
      DESCENT,
    )!;
    expect(atlas.pitch).toBe(CELL);
    const halves = (widthOf("i") + widthOf("m")) / 2;
    const near = (text: string, cells: number) =>
      Math.abs(
        inkWidth(composeText(atlas, text, 0))! - (cells * CELL + halves),
      );
    expect(near("im", 1)).toBeLessThanOrEqual(1);
    expect(near("i m", 2)).toBeLessThanOrEqual(1);
  });

  test("packs proportional letters a letter gap apart", () => {
    const atlas = buildGlyphAtlas(
      [proportional("Invoice"), proportional("Example")],
      DESCENT,
    )!;
    expect(atlas.pitch).toBeNull();
    expect(inkWidth(composeText(atlas, "ce", 0))).toBe(2 * X.width + 3);
  });
});
