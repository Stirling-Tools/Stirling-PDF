import { describe, it, expect } from "vitest";
import {
  isClassificationCategory,
  pinClassificationLast,
} from "@app/data/policyCategories";

describe("isClassificationCategory", () => {
  it("recognises the classification category and nothing else", () => {
    expect(isClassificationCategory("classification")).toBe(true);
    expect(isClassificationCategory("security")).toBe(false);
    expect(isClassificationCategory("")).toBe(false);
  });
});

describe("pinClassificationLast", () => {
  it("moves classification to the end, preserving other order", () => {
    expect(
      pinClassificationLast(["classification", "security", "compliance"]),
    ).toEqual(["security", "compliance", "classification"]);
  });

  it("leaves an order without classification untouched", () => {
    expect(pinClassificationLast(["security", "compliance"])).toEqual([
      "security",
      "compliance",
    ]);
  });

  it("is a no-op when classification is already last", () => {
    expect(pinClassificationLast(["security", "classification"])).toEqual([
      "security",
      "classification",
    ]);
  });

  it("handles classification as the only policy", () => {
    expect(pinClassificationLast(["classification"])).toEqual([
      "classification",
    ]);
  });
});
