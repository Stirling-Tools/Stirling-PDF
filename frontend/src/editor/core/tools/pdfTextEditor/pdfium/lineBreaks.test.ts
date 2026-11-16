import { describe, expect, it } from "vitest";
import {
  softLineStarts,
  softStartsFor,
} from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";
import { joinSoftLines } from "@editor/tools/pdfTextEditor/commands/scanLayout";

const CHAR = 5;
const line = (text: string, left = 0) => ({
  text,
  left,
  right: left + text.length * CHAR,
  fontSize: 10,
});

describe("softLineStarts", () => {
  it("reads a line that ends at the margin as wrapped and a short one as ended", () => {
    expect(
      softLineStarts([
        line("the quick brown fox jumps"),
        line("over the lazy dog and"),
        line("runs."),
        line("A new sentence starts here"),
      ]),
    ).toEqual([false, true, true, false]);
  });

  it("keeps list items, table rows and indented lines apart", () => {
    expect(
      softLineStarts([
        line("an item of the list goes"),
        line("- second item of the list"),
        line("indented continuation", 20),
        line("| North | 4,100 | 3,950 |"),
        line("| East | 7,520 | 6,880 |"),
      ]),
    ).toEqual([false, false, false, false, false]);
  });

  it("keeps a hyphenated line end, since joining cannot tell which hyphen to drop", () => {
    expect(
      softLineStarts([
        line("a word that ends hyph-"),
        line("enated at the margin of it"),
      ]),
    ).toEqual([false, false]);
  });

  it("keeps two short lines apart when the column's margin is further right", () => {
    expect(
      softLineStarts(
        [line("First bullet item"), line("Second bullet item")],
        300,
      ),
    ).toEqual([false, false]);
  });
});

describe("softStartsFor", () => {
  it("keeps flags across typing before and after a break, and reads a typed break as hard", () => {
    const flagged = "one two\nthree four\nfive";
    const flags = [false, true, false];
    expect(softStartsFor("one two!\nthree four\nfive", flagged, flags)).toEqual(
      flags,
    );
    expect(
      softStartsFor("one two\nthree\n four\nfive", flagged, flags),
    ).toEqual([false, true, false, false]);
  });

  it("keeps an Enter typed next to a space hard, and a break that moved with a typed letter soft", () => {
    expect(softStartsFor("one\n two three", "one two three", [])).toEqual([
      false,
      false,
    ]);
    expect(softStartsFor("one two\nthreex", "one two three", [])).toEqual([
      false,
      true,
    ]);
  });

  it("keeps a rewrap's breaks soft and a typed break hard when both happened since", () => {
    expect(
      softStartsFor(
        "one\ntwo three\nfour five\nsix",
        "one two three four five six",
        [false, false, false],
      )
        .map(String)
        .join(),
    ).toBe("false,true,true,true");
    expect(
      softStartsFor("one\ntwo three\n\nfour", "one two three four", []),
    ).toEqual([false, true, true, false]);
  });

  it("reads a break that replaced a space as a rewrap's", () => {
    expect(softStartsFor("one\ntwo three", "one two three", [])).toEqual([
      false,
      true,
    ]);
  });
});

describe("joinSoftLines", () => {
  const upTo = (n: number) => (text: string) => text.length <= n;

  it("pulls words up across soft breaks only, keeping every offset", () => {
    const text = "one two\nthree four\nfive six";
    const joined = joinSoftLines(text, [false, true, false], upTo(14));
    expect(joined).toBe("one two three\nfour\nfive six");
    expect(joined.length).toBe(text.length);
  });

  it("joins a whole line when only spaces follow its word", () => {
    expect(
      joinSoftLines("one\ntwo \nthree", [false, true, false], () => true),
    ).toBe("one two \nthree");
  });
});
