import { describe, expect, it } from "vitest";
import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import {
  furnitureText,
  matchingRuns,
  recogniseFurniture,
  type FurniturePage,
} from "@editor/tools/pdfTextEditor/util/pageFurniture";

const LETTER: DisplayTransformData = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
  cropLeft: 0,
  cropBottom: 0,
  cropWidth: 612,
  cropHeight: 792,
  rotate: 0,
  displayWidth: 612,
  displayHeight: 792,
};

/** `n` written in Arabic-Indic digits. */
function arabicIndic(n: number): string {
  return String(n).replace(/\d/g, (digit) =>
    String.fromCodePoint(0x0660 + Number(digit)),
  );
}

/** A run of `text` whose box starts `y` points up the page. */
function run(id: string, text: string, y: number, x = 72) {
  return { id, text, bounds: { x, y, width: 200, height: 10 } };
}

function page(
  pageIndex: number,
  runs: ReturnType<typeof run>[],
): FurniturePage {
  return { pageIndex, display: LETTER, runs };
}

describe("furnitureText", () => {
  it("reads each run of digits as one, and collapses whitespace", () => {
    expect(furnitureText("  Page 12  of\n30 ")).toBe("Page # of #");
  });

  it("reads digits in any script", () => {
    expect(furnitureText(`Page ${arabicIndic(12)}`)).toBe("Page #");
  });
});

describe("matchingRuns", () => {
  const pages = [
    page(0, [run("a", "Draft 1", 400)]),
    page(1, [run("b", "Draft 2", 402, 300), run("c", "Draft 2", 420)]),
    page(2, [run("d", "Final", 400)]),
  ];

  it("finds the same text, digits aside, at the same height on other pages", () => {
    expect(
      matchingRuns(pages, 0, pages[0].runs[0]).map((m) => m.run.id),
    ).toEqual(["b"]);
  });
});

describe("recogniseFurniture", () => {
  /** Page `i` of a document whose pages each draw `extra` runs too. */
  const furnished = (i: number, extra: ReturnType<typeof run>[] = []) =>
    page(i, [
      run(`h${i}`, "Acme Corp | Q3 report", 760),
      run(`n${i}`, `Page ${i + 1}`, 30),
      run(`f${i}`, "Confidential", 50),
      run(`b${i}`, `Body of page ${i + 1}`, 400),
      ...extra,
    ]);

  it("finds headers, footers and page numbers that most pages repeat", () => {
    const found = recogniseFurniture([furnished(0), furnished(1)], 2);
    expect(found.get(1)).toEqual(
      new Map([
        ["h1", "Header"],
        ["n1", "PageNum"],
        ["f1", "Footer"],
      ]),
    );
  });

  it("leaves text fewer than half the pages repeat", () => {
    const pages = [0, 1, 2, 3, 4].map((i) =>
      i < 2 ? furnished(i, [run(`x${i}`, "Note", 60)]) : furnished(i),
    );
    expect(recogniseFurniture(pages, 5).get(0)?.has("x0")).toBe(false);
  });

  it("leaves text away from the page's edges", () => {
    const found = recogniseFurniture(
      [
        furnished(0, [run("m0", "Draft", 400)]),
        furnished(1, [run("m1", "Draft", 400)]),
      ],
      2,
    );
    expect(found.get(0)?.has("m0")).toBe(false);
  });

  it("needs two pages, however short the document", () => {
    expect(recogniseFurniture([furnished(0)], 1).size).toBe(0);
  });

  it.each([
    ["alone", (n: number) => `${n}`],
    ["after a word", (n: number) => `Page ${n}`],
    ["before a total", (n: number) => `${n} of 9`],
    ["in German", (n: number) => `Seite ${n} von 9`],
    ["between dashes", (n: number) => `- ${n} -`],
    ["in Arabic-Indic digits", arabicIndic],
  ])(
    "reads a number counting up with the pages %s as a page number",
    (_, text) => {
      // Numbered from 3, as after an unnumbered cover and contents page.
      const pages = [0, 1].map((i) => page(i, [run(`p${i}`, text(i + 3), 30)]));
      expect(recogniseFurniture(pages, 2).get(0)?.get("p0")).toBe("PageNum");
    },
  );

  it.each([
    ["stays the same", () => "Report 2026"],
    ["jumps between chapters", (i: number) => `Chapter ${i < 2 ? 3 : 4}`],
  ])("reads text whose number %s as a footer", (_, text) => {
    const pages = [0, 1, 2].map((i) => page(i, [run(`p${i}`, text(i), 30)]));
    expect(recogniseFurniture(pages, 3).get(0)?.get("p0")).toBe("Footer");
  });
});
