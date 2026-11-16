import { describe, expect, test } from "vitest";
import {
  hasRtl,
  isRtlBase,
  marksAfterLetters,
  readingOrder,
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
    ["מחיר 100% היום", "םויה 100% ריחמ"],
    ["המחיר ₪1,299.90 כולל", "ללוכ ₪1,299.90 ריחמה"],
    ["הוא (12) שם", "םש (12) אוה"],
    ["טלפון 03-555-1234 כאן", "ןאכ 03-555-1234 ןופלט"],
    ["المبلغ 3.5% فقط", "طقف %3.5 غلبملا"],
    ["السعر 12,450.75 ريال", "لاير 12,450.75 رعسلا"],
    ["الأرقام ١٢٣ هنا", "انه ١٢٣ ماقرألا"],
    ["تقرير ISO 50001", "ISO 50001 ريرقت"],
    ["رقم A-2026/11 هنا", "انه A-2026/11 مقر"],
    ["افتح report-2026.docx الآن", "نآلا report-2026.docx حتفا"],
    ["quotes مرحبا (تجربة) here", "quotes (ةبرجت) ابحرم here"],
    ["שלום \u200e+44 20\u200e עולם", "םלוע \u200e+44 20\u200e םולש"],
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

describe("readingOrder", () => {
  const read = (drawn: string) => {
    const { texts, faithful } = readingOrder([...drawn]);
    return { text: texts.join(""), faithful };
  };

  test.each([
    "بلغ الاستهلاك (في الربع) 12,450.75 كيلوواط [بزيادة 3.5%] حسب تقرير ISO 50001",
    "استخدم برنامج LibreOffice Writer أو Word لفتح report-2026.docx الآن.",
    "הטלפון הוא 03-555-1234 (שלוחה 12), והמחיר ₪1,299.90 לפי Open Source סעיף 4.",
    "An English line quoting مرحبا بالعالم (تجربة) and שלום עולם then 1,234.",
    "الأرقام ١٢٣٤٥٦٧٨٩٠ و۱۲۳۴ (فارسية).",
    "plain latin, 12.5%",
  ])("reads %j back from the order it is drawn in", (logical) => {
    expect(read(visualOrder(logical).visual)).toEqual({
      text: logical,
      faithful: true,
    });
  });

  test("keeps a letter and its marks together", () => {
    const drawn = ["ם", "ו\u05b9", "ל", "ש\u05b8\u05c1"];

    expect(readingOrder(drawn).texts.join("")).toBe("שָׁלוֹם");
  });

  test("says so when no reading order draws the line the way it is drawn", () => {
    const rightToLeftParagraphOpeningWithLatin = "رايعملا وه ISO 50001";

    expect(read(rightToLeftParagraphOpeningWithLatin).faithful).toBe(false);
  });
});
