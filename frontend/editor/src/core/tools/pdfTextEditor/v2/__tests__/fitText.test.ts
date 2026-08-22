import { describe, expect, it } from "vitest";
import {
  fitTextToWidth,
  NO_FIT,
} from "@app/tools/pdfTextEditor/v2/util/fitText";

describe("fitTextToWidth", () => {
  it("leaves text alone when it already matches", () => {
    expect(fitTextToWidth("hello", 100, 100, 16)).toEqual(NO_FIT);
  });

  it("ignores sub-pixel differences", () => {
    expect(fitTextToWidth("hello", 100.4, 100, 16)).toEqual(NO_FIT);
  });

  it("tightens with negative tracking when the text is too wide", () => {
    // 10px over 10 chars = 1px per gap, well inside the tracking budget.
    const fit = fitTextToWidth("abcdefghij", 110, 100, 16);
    expect(fit.scaleX).toBe(1);
    expect(fit.letterSpacing).toBeCloseTo(-1, 5);
  });

  it("loosens with positive tracking when the text is too narrow", () => {
    const fit = fitTextToWidth("abcdefghij", 90, 100, 16);
    expect(fit.scaleX).toBe(1);
    expect(fit.letterSpacing).toBeCloseTo(1, 5);
  });

  it("scales instead of tracking when the correction is too large to hide", () => {
    // 40px over 10 chars = 4px per gap on a 16px font = 0.25em, over budget.
    const fit = fitTextToWidth("abcdefghij", 140, 100, 16);
    expect(fit.letterSpacing).toBe(0);
    expect(fit.scaleX).toBeCloseTo(100 / 140, 5);
  });

  it("scales a single character, which has no gaps to tighten", () => {
    const fit = fitTextToWidth("W", 30, 20, 16);
    expect(fit.letterSpacing).toBe(0);
    expect(fit.scaleX).toBeCloseTo(20 / 30, 5);
  });

  it("gives up rather than squashing when the inputs disagree wildly", () => {
    // A paragraph measured on one line against a single line's width.
    expect(fitTextToWidth("a lot of text", 5000, 100, 14)).toEqual(NO_FIT);
    expect(fitTextToWidth("x", 10, 100, 14)).toEqual(NO_FIT);
  });

  it("is inert for empty or degenerate input", () => {
    expect(fitTextToWidth("", 100, 50, 16)).toEqual(NO_FIT);
    expect(fitTextToWidth("hi", 0, 50, 16)).toEqual(NO_FIT);
    expect(fitTextToWidth("hi", 50, 0, 16)).toEqual(NO_FIT);
    expect(fitTextToWidth("hi", NaN, 50, 16)).toEqual(NO_FIT);
  });

  it("counts a surrogate pair as one character", () => {
    // Two emoji = 2 characters, so 10px of overflow is 5px per gap.
    const fit = fitTextToWidth("😀😀", 110, 100, 64);
    expect(fit.letterSpacing).toBeCloseTo(-5, 5);
  });
});
