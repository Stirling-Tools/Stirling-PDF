import { describe, expect, test } from "vitest";
import {
  APPROXIMATE_MATCH_SCORE,
  isApproximateMatch,
} from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";
import type {
  RankedStyle,
  ScanStyle,
} from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  HELVETICA,
  TIMES,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const style: ScanStyle = {
  family: "Helvetica",
  fontSize: 12,
  stretch: 1,
  ink: { r: 0, g: 0, b: 0, a: 255 },
  weight: 0,
  hollow: 0,
  softness: 0,
};

const ranked = (face: Face, score: number): RankedStyle => ({
  face,
  style: { ...style, family: face.family },
  score,
});

describe("approximate scan font matches", () => {
  test("flags a best match that scores under the threshold", () => {
    const choices = [ranked(HELVETICA, 0.74), ranked(TIMES, 0.72)];
    expect(isApproximateMatch(choices, choices[0])).toBe(true);
  });

  test("does not flag a best match at or over the threshold", () => {
    const choices = [
      ranked(HELVETICA, APPROXIMATE_MATCH_SCORE),
      ranked(TIMES, 0.6),
    ];
    expect(isApproximateMatch(choices, choices[0])).toBe(false);
  });

  test("does not flag the only font that can draw the script", () => {
    const only = [ranked(HELVETICA, 0.57)];
    expect(isApproximateMatch(only, only[0])).toBe(false);
  });
});
