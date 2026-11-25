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

/** A Letter page turned a quarter for display. */
const LETTER_TURNED: DisplayTransformData = {
  ...LETTER,
  a: 0,
  b: 1,
  c: -1,
  d: 0,
  e: 792,
  rotate: 90,
  displayWidth: 792,
  displayHeight: 612,
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

/** A table cell `width` points wide, its box starting at (x, y). */
function cell(id: string, text: string, y: number, x: number, width = 100) {
  return { ...run(id, text, y, x), bounds: { x, y, width, height: 10 } };
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

  it("needs two pages for headers and footers, however short the document", () => {
    expect(recogniseFurniture([furnished(0)], 1).get(0)).toEqual(
      new Map([["n0", "PageNum"]]),
    );
  });

  it("finds a page number shown once that numbers its own page", () => {
    const found = recogniseFurniture(
      [
        page(2, [run("a", "Page 3", 30)]),
        page(3, [run("b", "4 of 12", 30)]),
        page(4, [run("c", "- 5 -", 760)]),
      ],
      12,
    );
    expect([kindsOn(found, 2), kindsOn(found, 3), kindsOn(found, 4)]).toEqual([
      { a: "PageNum" },
      { b: "PageNum" },
      { c: "PageNum" },
    ]);
  });

  it("leaves a lone number that is not its page's, or that opens a heading", () => {
    const found = recogniseFurniture(
      [page(0, [run("a", "Page 7", 30), run("b", "1 Introduction", 760)])],
      12,
    );
    expect(found.size).toBe(0);
  });

  it.each(["Figure 3", "Fig. 3", "Part 3", "Step 3", "Table 3"])(
    "leaves a lone %s that labels something else, at its own page's edge",
    (text) => {
      const found = recogniseFurniture(
        [page(2, [run("a", text, 30), run("b", text, 760)])],
        12,
      );
      expect(found.size).toBe(0);
    },
  );

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

  it("reads two page numbers to a sheet as a footer", () => {
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        run(`l${i}`, `${2 * i + 1}`, 30, 72),
        run(`r${i}`, `${2 * i + 2}`, 30, 400),
      ]),
    );
    expect(kindsOn(recogniseFurniture(pages, 3), 1)).toEqual({
      l1: "Footer",
      r1: "Footer",
    });
  });

  it("reads page numbers that skip an unnumbered page as a footer", () => {
    const pages = [1, 2, null, 3, 4].map((n, i) =>
      page(i, n === null ? [] : [run(`p${i}`, `Page ${n}`, 30)]),
    );
    expect(kindsOn(recogniseFurniture(pages, 5), 3)).toEqual({ p3: "Footer" });
  });

  it("reads a footer set in four parts as furniture, its page number included", () => {
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        run(`a${i}`, "Acme Ltd", 30, 72),
        run(`c${i}`, "Confidential", 30, 200),
        run(`w${i}`, "www.acme.example", 30, 320),
        run(`n${i}`, `Page ${i + 1}`, 30, 440),
      ]),
    );
    expect(kindsOn(recogniseFurniture(pages, 3), 1)).toEqual({
      a1: "Footer",
      c1: "Footer",
      w1: "Footer",
      n1: "PageNum",
    });
  });

  it("keeps the page number in a header set as a table, and leaves its other cells", () => {
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        run(`d${i}`, "Doc QP-01", 760, 72),
        run(`v${i}`, "Rev 2", 760, 200),
        run(`y${i}`, "2024", 760, 320),
        run(`n${i}`, `Page ${i + 1} of 3`, 760, 440),
        run(`o${i}`, "Owner", 745, 72),
        run(`q${i}`, "Quality", 745, 200),
        run(`s${i}`, "Approved", 745, 320),
        run(`j${i}`, "J. Okafor", 745, 440),
      ]),
    );
    expect(kindsOn(recogniseFurniture(pages, 3), 1)).toEqual({
      n1: "PageNum",
    });
  });

  it("reads a turned page's footer along its displayed lines, beside text on its unturned line", () => {
    const turnedRun = (id: string, text: string, x: number) => ({
      ...run(id, text, 0),
      bounds: { x, y: 72, width: 10, height: 120 },
    });
    const pages = [0, 1, 2].map((i) => ({
      pageIndex: i,
      display: LETTER_TURNED,
      runs: [
        turnedRun(`f${i}`, "Confidential", 30),
        ...[200, 300, 400].map((x) => turnedRun(`b${i}-${x}`, `Body ${x}`, x)),
      ],
    }));
    expect(kindsOn(recogniseFurniture(pages, 3), 1)).toEqual({
      f1: "Footer",
    });
  });

  it("leaves a table's header row that each page repeats near its top", () => {
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        ...["Ref", "Item", "Qty", "Total"].map((text, x) =>
          run(`c${i}-${x}`, text, 720, 72 + x * 120),
        ),
        ...[
          `A-${[25, 61, 47][i]}`,
          "Widget",
          `${[7, 2, 5][i]}`,
          `${[12, 3, 8][i]}.50`,
        ].map((text, x) => run(`r${i}-${x}`, text, 705, 72 + x * 120)),
      ]),
    );
    expect(recogniseFurniture(pages, 3).size).toBe(0);
  });

  it("leaves a value near an edge that each page shows twice and changes from page to page", () => {
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        run(`l${i}`, `PO-00${[25, 61, 47][i]}`, 40, 72),
        run(`r${i}`, `PO-00${[25, 61, 47][i]}`, 40, 400),
      ]),
    );
    expect(recogniseFurniture(pages, 3).size).toBe(0);
  });

  it("leaves values near an edge whose number changes on every page without counting them", () => {
    const pages = [0, 1, 2].map((i) =>
      page(i, [run(`v${i}`, `PO-00${[25, 61, 47][i]}`, 40)]),
    );
    expect(recogniseFurniture(pages, 3).size).toBe(0);
  });

  it("leaves a two-column table's header row that each page repeats near its top", () => {
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        cell(`h${i}-0`, "Name", 740, 72),
        cell(`h${i}-1`, "Value", 740, 320),
        cell(`d${i}-0`, ["Alpha", "Beta", "Gamma"][i], 725, 72),
        cell(`d${i}-1`, ["High", "Low", "Medium"][i], 725, 320),
      ]),
    );
    expect(recogniseFurniture(pages, 3).size).toBe(0);
  });

  it("leaves a table's header row when the rows under it leave cells empty", () => {
    const columns = [72, 200, 330, 460];
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        ...["Ref", "Item", "Qty", "Total"].map((text, c) =>
          cell(`h${i}-${c}`, text, 740, columns[c]),
        ),
        cell(`d${i}-0`, ["A-25", "A-61", "A-47"][i], 725, columns[0]),
        cell(`d${i}-3`, ["12.50", "3.50", "8.50"][i], 725, columns[3]),
      ]),
    );
    expect(recogniseFurniture(pages, 3).size).toBe(0);
  });

  it("leaves a table's heading rows that each page repeats word for word", () => {
    const columns = [72, 200, 330, 460];
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        ...["Region", "Sales", "Costs", "Margin"].map((text, c) =>
          cell(`h${i}-${c}`, text, 740, columns[c]),
        ),
        ...["", "(£k)", "(£k)", "(%)"].flatMap((text, c) =>
          text ? [cell(`u${i}-${c}`, text, 725, columns[c])] : [],
        ),
        ...[["North", "South", "East"][i], "41", "17", "58"].map((text, c) =>
          cell(`d${i}-${c}`, text, 710, columns[c]),
        ),
      ]),
    );
    expect(recogniseFurniture(pages, 3).size).toBe(0);
  });

  it("leaves a footer set as a table in two rows, keeping its page number", () => {
    const columns = [72, 200, 330, 460];
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        ...["Acme Ltd", "1 High Street", "London EC1A", "United Kingdom"].map(
          (text, c) => cell(`a${i}-${c}`, text, 44, columns[c]),
        ),
        ...["T 020 7946", "info@acme", "www.acme", `Page ${i + 1}`].map(
          (text, c) => cell(`b${i}-${c}`, text, 30, columns[c]),
        ),
      ]),
    );
    expect(kindsOn(recogniseFurniture(pages, 3), 1)).toEqual({
      "b1-3": "PageNum",
    });
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

  it("reads a header in two parts as a header beside a row of watermark tiles", () => {
    const pages = [0, 1].map((i) =>
      page(i, [
        run(`h${i}`, "Acme Corp", 760, 72),
        run(`q${i}`, "Q3 report", 760, 400),
        ...tiles(i),
      ]),
    );
    expect(kindsOn(recogniseFurniture(pages, 2), 0)).toMatchObject({
      h0: "Header",
      q0: "Header",
    });
  });

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

  it("reads text set at an angle on a one-page document as a watermark", () => {
    const pages = [page(0, [run("w", "SAMPLE", 400, 200, { angle: 45 })])];
    expect(kindsOn(recogniseFurniture(pages, 1), 0)).toEqual({
      w: "Watermark",
    });
  });

  it("reads large text set at an angle on one page of several as a watermark, but not a slanted label", () => {
    const stamp = {
      ...run("w", "COPY", 400, 200, { angle: 40 }),
      bounds: { x: 200, y: 300, width: 220, height: 190 },
    };
    const label = {
      ...run("l", "March", 300, 72, { angle: 45 }),
      bounds: { x: 72, y: 300, width: 28, height: 28 },
    };
    const pages = [page(0, [stamp, label]), page(1, []), page(2, [])];
    expect(kindsOn(recogniseFurniture(pages, 3), 0)).toEqual({
      w: "Watermark",
    });
  });

  it("leaves a table's number cells spread across the page", () => {
    const cells = [100, 300, 500, 700].flatMap((y, row) =>
      [72, 250, 450].map((x, col) =>
        run(`c${row}-${col}`, String(row * 10 + col + 7), y, x),
      ),
    );
    expect(recogniseFurniture([page(0, cells)], 1).size).toBe(0);
  });

  it("leaves a table's repeated answers that spread across the page", () => {
    const rows = Array.from({ length: 31 }, (_, k) => 100 + k * 20);
    const cells = rows.flatMap((y, k) => [
      cell(`f${k}`, `Feature ${k}`, y, 72),
      cell(`a${k}`, k % 2 ? "Yes" : "No", y, 200, 80),
      cell(`b${k}`, k % 3 ? "No" : "Yes", y, 520, 80),
    ]);
    expect(recogniseFurniture([page(0, cells)], 1).size).toBe(0);
  });

  it("leaves a table's column headings set at an angle on every page", () => {
    const columns = [72, 172, 272, 372];
    const pages = [0, 1, 2].map((i) =>
      page(i, [
        ...["Speed", "Range", "Weight", "Price"].map((text, c) => ({
          ...run(`h${i}-${c}`, text, 700, columns[c], { angle: 45 }),
          bounds: { x: columns[c], y: 700, width: 60, height: 60 },
        })),
        ...["Fast", "Long", "Light", ["£9", "£7", "£5"][i]].map((text, c) =>
          cell(`d${i}-${c}`, text, 680, columns[c], 60),
        ),
      ]),
    );
    expect(recogniseFurniture(pages, 3).size).toBe(0);
  });

  it("leaves an image set at an angle, and see-through text, on a one-page document", () => {
    const photo = { ...image("img", 100, 300), matrix: turned(8, 100, 300) };
    const faded = [400, 380, 360].map((y) =>
      run(`t${y}`, `Line at ${y}`, y, 72, { alpha: 230 }),
    );
    expect(recogniseFurniture([page(0, faded, [photo])], 1).size).toBe(0);
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
