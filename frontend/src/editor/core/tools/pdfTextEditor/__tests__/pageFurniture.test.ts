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

/** Turned `angle` degrees about (x, y). */
function turned(angle: number, x: number, y: number) {
  const r = (angle * Math.PI) / 180;
  return {
    a: Math.cos(r),
    b: Math.sin(r),
    c: -Math.sin(r),
    d: Math.cos(r),
    e: x,
    f: y,
  };
}

/**
 * A run of `text` whose box starts `y` points up the page, black and square
 * to it unless `look` says otherwise.
 */
function run(
  id: string,
  text: string,
  y: number,
  x = 72,
  look: { alpha?: number; angle?: number } = {},
) {
  return {
    id,
    text,
    bounds: { x, y, width: 200, height: 10 },
    matrix: turned(look.angle ?? 0, x, y),
    fill: { r: 0, g: 0, b: 0, a: look.alpha ?? 255 },
  };
}

function image(id: string, x: number, y: number) {
  return {
    id,
    bounds: { x, y, width: 30, height: 30 },
    matrix: turned(0, x, y),
  };
}

function page(
  pageIndex: number,
  runs: ReturnType<typeof run>[],
  images: ReturnType<typeof image>[] = [],
): FurniturePage {
  return { pageIndex, display: LETTER, runs, images };
}

/** The kinds found on page `pageIndex`, by id. */
function kindsOn(
  found: ReturnType<typeof recogniseFurniture>,
  pageIndex: number,
) {
  return Object.fromEntries(found.get(pageIndex) ?? []);
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

describe("recogniseFurniture watermarks", () => {
  /** A see-through "DRAFT" tiled across the page, as the watermark tool draws one. */
  const tiles = (i: number) =>
    [0, 372, 744].flatMap((y) =>
      [0, 200, 400].map((x) =>
        run(`w${i}-${x}-${y}`, "DRAFT", y, x, { alpha: 128 }),
      ),
    );

  it("reads tiled see-through text as a watermark, even at the page's edges", () => {
    const pages = [0, 1].map((i) =>
      page(i, [run(`h${i}`, "Acme Corp", 760), ...tiles(i)]),
    );
    expect(kindsOn(recogniseFurniture(pages, 2), 0)).toEqual({
      h0: "Header",
      ...Object.fromEntries(tiles(0).map((tile) => [tile.id, "Watermark"])),
    });
  });

  it("reads text set at an angle in the same place on most pages as a watermark", () => {
    const pages = [0, 1].map((i) =>
      page(i, [run(`c${i}`, "CONFIDENTIAL", 400, 200, { angle: 45 })]),
    );
    expect(kindsOn(recogniseFurniture(pages, 2), 1)).toEqual({
      c1: "Watermark",
    });
  });

  it("reads a tiled page of a one-page document as watermarked", () => {
    const tiled = [
      run("t1", "COPY", 100, 50),
      run("t2", "COPY", 400, 400),
      run("t3", "COPY", 700, 50),
    ];
    expect(kindsOn(recogniseFurniture([page(0, tiled)], 1), 0)).toEqual({
      t1: "Watermark",
      t2: "Watermark",
      t3: "Watermark",
    });
  });

  it("leaves copies of a label that do not spread across the page", () => {
    const labels = (i: number) =>
      [300, 400, 500].map((y) => run(`n${i}-${y}`, "N/A", y, 300));
    const pages = [0, 1].map((i) => page(i, labels(i)));
    expect(recogniseFurniture(pages, 2).size).toBe(0);
  });

  it("leaves see-through text one page shows once", () => {
    const pages = [
      page(0, [run("s0", "Note", 400, 72, { alpha: 128 })]),
      page(1, []),
    ];
    expect(recogniseFurniture(pages, 2).size).toBe(0);
  });

  it("leaves text that repeats in place but looks like any other", () => {
    const pages = [0, 1].map((i) => page(i, [run(`s${i}`, "Signature:", 400)]));
    expect(recogniseFurniture(pages, 2).size).toBe(0);
  });

  it("reads tiled images as a watermark, and leaves an image each page shows once", () => {
    const spread = [
      [100, 100],
      [450, 400],
      [100, 700],
    ];
    const pages = [0, 1].map((i) =>
      page(
        i,
        [],
        [
          {
            ...image(`logo${i}`, 500, 700),
            bounds: { x: 500, y: 700, width: 60, height: 20 },
          },
          ...spread.map(([x, y]) => image(`i${i}-${y}`, x, y)),
        ],
      ),
    );
    expect(kindsOn(recogniseFurniture(pages, 2), 0)).toEqual({
      "i0-100": "Watermark",
      "i0-400": "Watermark",
      "i0-700": "Watermark",
    });
  });
});
