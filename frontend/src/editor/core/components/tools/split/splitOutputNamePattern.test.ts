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
});

describe("describeNamePattern", () => {
  test("previews the first two names", () => {
    expect(describeNamePattern("Chapter: {n}")).toBe("Chapter 1, Chapter 2…");
  });
});
