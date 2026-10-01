import { describe, it, expect } from "vitest";
import {
  scoreMatch,
  minScoreForQuery,
  isFuzzyMatch,
} from "@app/utils/fuzzySearch";

describe("scoreMatch", () => {
  it("scores substring matches highest", () => {
    expect(scoreMatch("rota", "Rotate")).toBeGreaterThanOrEqual(90);
    expect(scoreMatch("priv", "private")).toBeGreaterThanOrEqual(
      minScoreForQuery("priv"),
    );
  });

  it("tolerates small typos", () => {
    expect(isFuzzyMatch("rotaet", "rotate")).toBe(true);
    expect(isFuzzyMatch("comprss", "compress")).toBe(true);
    // Typo inside one token of a multi-word target
    expect(isFuzzyMatch("watermrk", "Add Watermark")).toBe(true);
  });

  it("rejects unrelated words that share half their letters", () => {
    // Unrelated words can share many letters (rotate vs update is edit
    // distance 3 of 6) but must not be treated as a fuzzy match.
    expect(isFuzzyMatch("rotate", "update")).toBe(false);
    expect(isFuzzyMatch("rotate", "create")).toBe(false);
    expect(isFuzzyMatch("rotate", "private")).toBe(false);
    expect(isFuzzyMatch("rotate", "isolated")).toBe(false);
    expect(isFuzzyMatch("rotate", "automate")).toBe(false);
    expect(isFuzzyMatch("rotate", "annotate")).toBe(false);
    expect(isFuzzyMatch("rotat", "protect")).toBe(false);
    expect(isFuzzyMatch("rotat", "redact")).toBe(false);
    expect(isFuzzyMatch("rotat", "contrast")).toBe(false);
    expect(isFuzzyMatch("rotat", "annotate")).toBe(false);
  });
});

describe("minScoreForQuery", () => {
  it("does not loosen the threshold for long queries", () => {
    expect(minScoreForQuery("rot")).toBe(40);
    expect(minScoreForQuery("rotate")).toBe(30);
    expect(minScoreForQuery("orientation")).toBe(30);
  });
});
