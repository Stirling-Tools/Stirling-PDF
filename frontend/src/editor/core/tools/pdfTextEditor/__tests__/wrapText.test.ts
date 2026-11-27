import { describe, expect, test } from "vitest";
import { wrapEachLine } from "@editor/tools/pdfTextEditor/util/wrapText";

describe("wrapEachLine", () => {
  const fitsIn = (width: number) => (line: string) => line.length <= width;

  test("breaks each line at the last space that fits, keeping existing breaks", () => {
    expect(wrapEachLine("one two three four\nfive six", fitsIn(9))).toBe(
      "one two\nthree\nfour\nfive six",
    );
  });

  test("gives a word too long for any line a line of its own", () => {
    expect(wrapEachLine("a extraordinarily b", fitsIn(5))).toBe(
      "a\nextraordinarily\nb",
    );
  });
});
