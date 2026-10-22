import { describe, expect, test } from "vitest";
import {
  applyNamePattern,
  describeNamePattern,
} from "@app/components/tools/split/splitOutputNamePattern";

describe("applyNamePattern", () => {
  test.each([
    ["Part {n}", 3, "Part 3"],
    ["Part", 3, "Part 3"],
    ["{n} of {n}", 2, "2 of 2"],
    ["Pride and Prejudice Chapter: {n}", 1, "Pride and Prejudice Chapter 1"],
    ["Report / Summary {n}", 1, "Report Summary 1"],
    ["Q3/Q4 {n}", 1, "Q3_Q4 1"],
  ])("%s → %s", (pattern, number, expected) => {
    expect(applyNamePattern(pattern, number)).toBe(expected);
  });

  test("a long run of illegal characters is handled in linear time", () => {
    const quotes = '"'.repeat(200_000);
    expect(applyNamePattern(`a${quotes} {n}`, 1)).toBe("a 1");
    expect(applyNamePattern(`a${quotes}b`, 1)).toBe(
      `a${"_".repeat(200_000)}b 1`,
    );
  }, 5_000);
});

describe("describeNamePattern", () => {
  test("previews the first two names", () => {
    expect(describeNamePattern("Chapter: {n}")).toBe("Chapter 1, Chapter 2…");
  });
});
