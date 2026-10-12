import { describe, expect, it } from "vitest";
import {
  fitTokenAdvance,
  NO_TOKEN_FIT,
  stackLineBoxes,
} from "@app/tools/pdfTextEditor/util/lineLayout";

function renderedAdvance(
  charCount: number,
  naturalPx: number,
  fit: { letterSpacingPx: number; marginRightPx: number },
): number {
  return naturalPx + charCount * fit.letterSpacingPx + fit.marginRightPx;
}

describe("fitTokenAdvance", () => {
  it("leaves a token alone when it already measures right", () => {
    expect(fitTokenAdvance(5, 80, 80, 16)).toEqual(NO_TOKEN_FIT);
  });

  it("ignores differences too small to see", () => {
    expect(fitTokenAdvance(5, 80, 80.005, 16)).toEqual(NO_TOKEN_FIT);
  });

  it("tightens a token the browser laid out too wide", () => {
    const fit = fitTokenAdvance(3, 26.813, 23.422, 19);
    expect(fit.letterSpacingPx).toBeLessThan(0);
    expect(renderedAdvance(3, 26.813, fit)).toBeCloseTo(23.422, 6);
  });

  it("widens a token the browser laid out too narrow", () => {
    const fit = fitTokenAdvance(10, 70, 76.7, 19);
    expect(fit.letterSpacingPx).toBeGreaterThan(0);
    expect(renderedAdvance(10, 70, fit)).toBeCloseTo(76.7, 6);
  });

  it("spreads the correction between glyphs, not after the last one", () => {
    const fit = fitTokenAdvance(3, 30, 24, 20);
    expect(fit.letterSpacingPx).toBeCloseTo(-3, 6);
    expect(fit.marginRightPx).toBeCloseTo(3, 6);
  });

  it("puts the whole correction in the margin for a single glyph", () => {
    const fit = fitTokenAdvance(1, 10, 14, 16);
    expect(fit.letterSpacingPx).toBe(0);
    expect(fit.marginRightPx).toBeCloseTo(4, 6);
    expect(renderedAdvance(1, 10, fit)).toBeCloseTo(14, 6);
  });

  it("caps tracking but still lands on the exact advance", () => {
    const fit = fitTokenAdvance(4, 20, 200, 16);
    expect(fit.letterSpacingPx).toBeCloseTo(0.25 * 16, 6);
    expect(renderedAdvance(4, 20, fit)).toBeCloseTo(200, 6);
  });

  it("refuses nonsense inputs rather than emitting NaN", () => {
    expect(fitTokenAdvance(0, 10, 20, 16)).toEqual(NO_TOKEN_FIT);
    expect(fitTokenAdvance(3, Number.NaN, 20, 16)).toEqual(NO_TOKEN_FIT);
    expect(fitTokenAdvance(3, 10, Number.POSITIVE_INFINITY, 16)).toEqual(
      NO_TOKEN_FIT,
    );
    expect(fitTokenAdvance(3, -1, 20, 16)).toEqual(NO_TOKEN_FIT);
  });
});

describe("stackLineBoxes", () => {
  it("puts the first baseline where the caller asked", () => {
    const stack = stackLineBoxes([100, 120, 140], 16, 12);
    expect(stack?.topPx).toBe(88);
    expect(stack?.marginTopsPx[0]).toBe(0);
  });

  it("keeps uneven leading instead of averaging it", () => {
    const stack = stackLineBoxes([100, 120, 143], 16, 12);
    expect(stack?.marginTopsPx).toEqual([0, 4, 7]);
  });

  it("stacks back onto the exact baselines it was given", () => {
    const baselines = [100, 120, 143, 161.5];
    const stack = stackLineBoxes(baselines, 16, 12);
    let y = stack!.topPx;
    baselines.forEach((baseline, i) => {
      y += stack!.marginTopsPx[i];
      expect(y + 12).toBeCloseTo(baseline, 6);
      y += 16;
    });
  });

  it("allows a negative gap when lines overlap", () => {
    const stack = stackLineBoxes([100, 110], 16, 12);
    expect(stack?.marginTopsPx[1]).toBe(-6);
  });

  it("rejects input it cannot place", () => {
    expect(stackLineBoxes([], 16, 12)).toBeNull();
    expect(stackLineBoxes([100, Number.NaN], 16, 12)).toBeNull();
    expect(stackLineBoxes([100], 0, 12)).toBeNull();
    expect(stackLineBoxes([100], 16, Number.NaN)).toBeNull();
  });

  it("collapses to no gaps when the leading really is even", () => {
    expect(stackLineBoxes([100, 116, 132], 16, 12)?.marginTopsPx).toEqual([
      0, 0, 0,
    ]);
  });
});
