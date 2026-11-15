import { describe, expect, test } from "vitest";
import {
  hasRtl,
  isRtlBase,
  marksAfterLetters,
  visualOrder,
} from "@editor/tools/pdfTextEditor/util/bidi";

describe("visualOrder", () => {
  test.each([
    ["שלום עולם", "םלוע םולש"],
    ["abc שלום def", "abc םולש def"],
    ["שלום 123 עולם", "םלוע 123 םולש"],
    ["שלום abc def עולם", "םלוע abc def םולש"],
    ["(שלום)", "(םולש)"],
    ["מחיר 1,250.00 היום", "םויה 1,250.00 ריחמ"],
    ["plain latin", "plain latin"],
  ])("draws %j as %j", (logical, visual) => {
    expect(visualOrder(logical).visual).toBe(visual);
  });

  test("maps every drawn position back to the character it shows", () => {
    const text = "Mixed: hello שלום world 123.";
    const { visual, order } = visualOrder(text);
    expect([...order].sort((a, b) => a - b)).toEqual(
      [...text].map((_, i) => i),
    );
    order.forEach((logical, drawn) =>
      expect(visual[drawn]).toBe(text[logical]),
    );
  });

  test("keeps a surrogate pair in order", () => {
    const { visual } = visualOrder("שלום 😀");
    expect(visual).toBe("😀 םולש");
  });
});

describe("direction", () => {
  test.each([
    ["שלום world", true],
    ["hello עולם", false],
    ["123 שלום", true],
    ["", false],
  ])("%j starts right-to-left: %s", (text, rtl) => {
    expect(isRtlBase(text)).toBe(rtl);
  });

  test("finds right-to-left characters", () => {
    expect(hasRtl("hello")).toBe(false);
    expect(hasRtl("مرحبا")).toBe(true);
  });
});

describe("combining marks on right-to-left letters", () => {
  const reversed = (text: string) => [...text].reverse().join("");

  test.each([
    ["שָׁלוֹם", "ם" + "ו\u05b9" + "ל" + "ש\u05b8\u05c1"],
    ["يُولَدُ", "د\u064f" + "ل\u064e" + "و" + "ي\u064f"],
  ])("draws %j with each letter ahead of its marks", (logical, drawn) => {
    expect(visualOrder(logical).visual).toBe(drawn);
  });

  test.each(["שָׁלוֹם עוֹלָם", "يُولَدُ جَمِيعُ النَّاسِ"])(
    "reads %j back from the order it was drawn in",
    (logical) => {
      const read = reversed(visualOrder(logical).visual);
      expect(marksAfterLetters(read)).toBe(logical);
    },
  );

  test("leaves marks on left-to-right letters alone", () => {
    const text = "cafe\u0301 שלום";
    expect(marksAfterLetters(text)).toBe(text);
  });
});
