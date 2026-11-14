import { describe, expect, test } from "vitest";
import {
  needsArabicShaping,
  shapeArabic,
} from "@editor/tools/pdfTextEditor/util/arabicShaping";

const codes = (text: string) =>
  [...text].map((ch) => ch.codePointAt(0)!.toString(16));

describe("shapeArabic", () => {
  test.each([
    ["بيت", ["fe91", "fef4", "fe96"]],
    ["دار", ["fea9", "fe8d", "fead"]],
    ["سلام", ["feb3", "fefc", "fee1"]],
    ["لا", ["fefb"]],
    ["ب ت", ["fe8f", "20", "fe95"]],
  ])("joins %s", (text, expected) => {
    expect(codes(shapeArabic(text).text)).toEqual(expected);
  });

  test("lets a mark sit between two letters without breaking the join", () => {
    expect(codes(shapeArabic("بَت").text)).toEqual(["fe91", "64e", "fe96"]);
  });

  test("maps every shaped character back to what it shows, a ligature to both its letters", () => {
    const { source, sourceEnd } = shapeArabic("سلام");
    expect(source).toEqual([0, 1, 3]);
    expect(sourceEnd).toEqual([1, 3, 4]);
  });

  test("leaves other text alone", () => {
    expect(shapeArabic("hello שלום").text).toBe("hello שלום");
    expect(needsArabicShaping("hello שלום")).toBe(false);
    expect(needsArabicShaping("مرحبا")).toBe(true);
  });
});
