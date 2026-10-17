import { describe, expect, it } from "vitest";
import {
  bookletSideIndex,
  bookletSides,
  buildPrintJob,
  canPrint,
  defaultPrintSettings,
  parityPages,
  POSTER_PAGE_SIZES,
  PRINT_PRESETS,
  printFileName,
  printProblem,
  printSummary,
  rangeIsClipped,
  selectedPages,
  selectionPages,
  selectionRange,
} from "@app/components/viewer/print/printJob";
import type { PrintSettings } from "@app/components/viewer/print/printJob";

const settings = (overrides: Partial<PrintSettings> = {}): PrintSettings => ({
  ...defaultPrintSettings(),
  ...overrides,
});

const customLayout = (rows: number, cols: number): PrintSettings["layout"] => ({
  ...defaultPrintSettings().layout,
  mode: "CUSTOM",
  rows,
  cols,
});

const posterSettings = (
  xFactor: number,
  yFactor: number,
): PrintSettings["poster"] => ({
  ...defaultPrintSettings().poster,
  xFactor,
  yFactor,
});

const serverJob = (job: ReturnType<typeof buildPrintJob>) => {
  if (job.kind !== "server") {
    throw new Error(`expected a server job, got ${job.kind}`);
  }
  return job;
};

describe("bookletSideIndex", () => {
  it("finds the side of the imposition that holds a page", () => {
    const sides = bookletSides(12, "LEFT");

    expect(bookletSideIndex(sides, 1)).toBe(1);
    expect(bookletSideIndex(sides, 2)).toBe(2);
    expect(bookletSideIndex(sides, 3)).toBe(3);
    expect(bookletSideIndex(sides, 8)).toBe(5);
    expect(bookletSideIndex(sides, 12)).toBe(1);
  });

  it("falls back to the first side for a page the imposition does not place", () => {
    expect(bookletSideIndex(bookletSides(0, "LEFT"), 4)).toBe(1);
  });
});

describe("buildPrintJob", () => {
  it("hands the standard layout to the viewer with the page range", () => {
    const job = buildPrintJob(
      settings({ pageRange: " 1-3,5 ", includeAnnotations: false }),
    );

    expect(job).toEqual({
      kind: "viewer",
      pageRange: "1-3,5",
      includeAnnotations: false,
    });
  });

  it("leaves the page range undefined when it is blank", () => {
    const job = buildPrintJob(settings({ pageRange: "   " }));

    expect(job).toEqual({
      kind: "viewer",
      pageRange: undefined,
      includeAnnotations: true,
    });
  });

  it("sends the pages-per-sheet layout to the multi-page layout endpoint", () => {
    const job = serverJob(
      buildPrintJob(
        settings({
          preset: "pagesPerSheet",
          layout: customLayout(2, 3),
        }),
      ),
    );

    expect(job.endpoint).toBe("/api/v1/general/multi-page-layout");
    expect(job.suffix).toBe("n-up");
    expect(job.request).toMatchObject({ mode: "CUSTOM", rows: 2, cols: 3 });
  });

  it("sends the booklet layout to the booklet endpoint", () => {
    const job = serverJob(
      buildPrintJob(
        settings({
          preset: "booklet",
          booklet: {
            ...defaultPrintSettings().booklet,
            spineLocation: "RIGHT",
          },
        }),
      ),
    );

    expect(job.endpoint).toBe("/api/v1/general/booklet-imposition");
    expect(job.suffix).toBe("booklet");
    expect(job.request).toMatchObject({
      pagesPerSheet: 2,
      spineLocation: "RIGHT",
    });
  });

  it("sends the poster tiles to the poster endpoint", () => {
    const job = serverJob(
      buildPrintJob(
        settings({
          preset: "poster",
          poster: { pageSize: "A3", xFactor: 3, yFactor: 4, rightToLeft: true },
        }),
      ),
    );

    expect(job.endpoint).toBe("/api/v1/general/split-for-poster-print");
    expect(job.suffix).toBe("poster");
    expect(job.request).toEqual({
      pageSize: "A3",
      xFactor: 3,
      yFactor: 4,
      rightToLeft: true,
    });
  });

  it("passes the typed range verbatim when the filter is all", () => {
    const job = buildPrintJob(
      settings({ pageRange: " 1-3,5 ", parity: "all" }),
      8,
    );

    expect(job).toEqual({
      kind: "viewer",
      pageRange: "1-3,5",
      includeAnnotations: true,
    });
  });

  it("leaves the range undefined when the typed range is blank", () => {
    const job = buildPrintJob(settings({ pageRange: "   ", parity: "all" }), 8);

    expect(job).toEqual({
      kind: "viewer",
      pageRange: undefined,
      includeAnnotations: true,
    });
  });

  it("expands an odd filter to the pages it selects", () => {
    const job = buildPrintJob(settings({ pageRange: "1-6", parity: "odd" }), 6);

    expect(job).toEqual({
      kind: "viewer",
      pageRange: "1, 3, 5",
      includeAnnotations: true,
    });
  });

  it("expands an even filter of a blank range over the whole document", () => {
    const job = buildPrintJob(settings({ parity: "even" }), 5);

    expect(job).toEqual({
      kind: "viewer",
      pageRange: "2, 4",
      includeAnnotations: true,
    });
  });

  it("clips a range that reaches past the end before applying parity", () => {
    const job = buildPrintJob(
      settings({ pageRange: "1-99", parity: "odd" }),
      6,
    );

    expect(job).toEqual({
      kind: "viewer",
      pageRange: "1, 3, 5",
      includeAnnotations: true,
    });
  });

  it("falls back to the typed range when the filter selects nothing", () => {
    // A one page document has no even page, so the job keeps what was typed
    // rather than sending the viewer an empty range that means every page.
    const job = buildPrintJob(settings({ pageRange: "1", parity: "even" }), 1);

    expect(job).toEqual({
      kind: "viewer",
      pageRange: "1",
      includeAnnotations: true,
    });
  });

  it("ignores parity for the imposed presets", () => {
    for (const preset of ["pagesPerSheet", "booklet", "poster"] as const) {
      const filtered = buildPrintJob(settings({ preset, parity: "odd" }), 6);
      const unfiltered = buildPrintJob(settings({ preset, parity: "all" }), 6);

      expect(filtered).toEqual(unfiltered);
      expect(filtered.kind).toBe("server");
    }
  });
});

describe("canPrint", () => {
  it("accepts the default settings", () => {
    expect(canPrint(defaultPrintSettings())).toBe(true);
  });
});

describe("printProblem", () => {
  it("accepts the page lists the viewer's print engine takes", () => {
    for (const pageRange of ["", "  ", "7", "1-3,5", "2, 4-6", "1 - 3"]) {
      expect(printProblem(settings({ pageRange }))).toBeNull();
    }
  });

  it("rejects page ranges the engine cannot read", () => {
    for (const pageRange of ["abc", "3-1", "1-", "-3", "1,,2", "1;2"]) {
      expect(printProblem(settings({ pageRange }))).toBe("invalidPageRange");
    }
  });

  it("keeps poster tiles to whole numbers from one to ten", () => {
    const poster = (xFactor: number, yFactor: number) =>
      settings({ preset: "poster", poster: posterSettings(xFactor, yFactor) });

    expect(printProblem(poster(1, 10))).toBeNull();
    expect(printProblem(poster(0, 2))).toBe("invalidTiles");
    expect(printProblem(poster(2, 11))).toBe("invalidTiles");
    expect(printProblem(poster(1.5, 2))).toBe("invalidTiles");
    expect(printProblem(poster(2, Number.NaN))).toBe("invalidTiles");
  });

  it("names a layout that cannot be applied", () => {
    expect(
      printProblem(
        settings({ preset: "pagesPerSheet", layout: customLayout(0, 2) }),
      ),
    ).toBe("invalidLayout");
  });

  it("rejects a range that selects no page of the document", () => {
    expect(printProblem(settings({ pageRange: "99" }), 12)).toBe(
      "emptyPageRange",
    );
    expect(printProblem(settings({ pageRange: "0" }), 12)).toBe(
      "emptyPageRange",
    );
    expect(printProblem(settings({ pageRange: "99-100" }), 12)).toBe(
      "emptyPageRange",
    );
  });

  it("accepts a range that only reaches past the end", () => {
    expect(printProblem(settings({ pageRange: "10-99" }), 12)).toBeNull();
    expect(printProblem(settings({ pageRange: "" }), 12)).toBeNull();
  });

  it("checks syntax when it has no page count to check against", () => {
    expect(printProblem(settings({ pageRange: "99" }))).toBeNull();
    expect(printProblem(settings({ pageRange: "abc" }))).toBe(
      "invalidPageRange",
    );
  });

  it("reports a parity filter that leaves nothing to print", () => {
    expect(printProblem(settings({ pageRange: "1", parity: "even" }), 1)).toBe(
      "emptyPageRange",
    );
    expect(printProblem(settings({ parity: "even" }), 1)).toBe(
      "emptyPageRange",
    );
  });

  it("accepts a range under a parity filter that keeps a page", () => {
    expect(
      printProblem(settings({ pageRange: "1-6", parity: "odd" }), 6),
    ).toBeNull();
    expect(printProblem(settings({ parity: "even" }), 5)).toBeNull();
  });

  it("still refuses a range it cannot read under a parity filter", () => {
    expect(printProblem(settings({ pageRange: "abc", parity: "odd" }), 6)).toBe(
      "invalidPageRange",
    );
  });
});

describe("rangeIsClipped", () => {
  it("names a range that reaches past the document", () => {
    expect(rangeIsClipped("10-99", 12)).toBe(true);
    expect(rangeIsClipped("12, 20", 12)).toBe(true);
    expect(rangeIsClipped("13", 12)).toBe(true);
  });

  it("leaves a range the document can satisfy", () => {
    expect(rangeIsClipped("1-3,5", 12)).toBe(false);
    expect(rangeIsClipped("", 12)).toBe(false);
    expect(rangeIsClipped("abc", 12)).toBe(false);
    expect(rangeIsClipped("1-99", 99)).toBe(false);
  });
});

describe("printFileName", () => {
  it("keeps a pdf name and appends the layout suffix", () => {
    expect(printFileName("report.pdf", "n-up")).toBe("report - n-up.pdf");
  });

  it("adds the extension when the name has none", () => {
    expect(printFileName("report")).toBe("report.pdf");
    expect(printFileName("report", "poster")).toBe("report - poster.pdf");
  });
});

describe("preset catalogue", () => {
  it("lists every preset once", () => {
    expect(PRINT_PRESETS).toEqual([
      "standard",
      "pagesPerSheet",
      "booklet",
      "poster",
    ]);
  });

  it("offers the poster paper sizes the endpoint accepts", () => {
    expect(POSTER_PAGE_SIZES).toContain("A4");
    expect(POSTER_PAGE_SIZES).toContain("Tabloid");
  });
});

describe("selectedPages", () => {
  it("selects the named pages in print order", () => {
    expect(selectedPages("1-3,5", 8)).toEqual([1, 2, 3, 5]);
    expect(selectedPages(" 4 , 2-3 ", 8)).toEqual([2, 3, 4]);
  });

  it("selects every page for a blank range", () => {
    expect(selectedPages("   ", 3)).toEqual([1, 2, 3]);
  });

  it("drops pages past the end rather than refusing the range", () => {
    expect(selectedPages("1-99", 3)).toEqual([1, 2, 3]);
  });

  it("returns nothing for a range it cannot read", () => {
    expect(selectedPages("5-2", 8)).toBeNull();
    expect(selectedPages("pages", 8)).toBeNull();
  });

  it("selects nothing when the document has no pages", () => {
    expect(selectedPages("", 0)).toEqual([]);
  });
});

describe("parityPages", () => {
  it("keeps every page for the all filter", () => {
    expect(parityPages([1, 2, 3, 4], "all")).toEqual([1, 2, 3, 4]);
  });

  it("keeps the odd pages of a run", () => {
    expect(parityPages([1, 2, 3, 4, 5], "odd")).toEqual([1, 3, 5]);
  });

  it("keeps the even pages of a run", () => {
    expect(parityPages([1, 2, 3, 4, 5], "even")).toEqual([2, 4]);
  });

  it("selects nothing when no page has the wanted parity", () => {
    expect(parityPages([2, 4, 6], "odd")).toEqual([]);
  });
});

describe("selectionPages", () => {
  it("filters the range by parity", () => {
    expect(
      selectionPages(settings({ pageRange: "1-6", parity: "odd" }), 6),
    ).toEqual([1, 3, 5]);
    expect(
      selectionPages(settings({ pageRange: "1-6", parity: "even" }), 6),
    ).toEqual([2, 4, 6]);
  });

  it("filters every page of a blank range", () => {
    expect(selectionPages(settings({ parity: "even" }), 5)).toEqual([2, 4]);
  });

  it("clips the range to the document before applying parity", () => {
    expect(
      selectionPages(settings({ pageRange: "1-99", parity: "odd" }), 6),
    ).toEqual([1, 3, 5]);
  });

  it("returns null for a range it cannot read", () => {
    expect(
      selectionPages(settings({ pageRange: "abc", parity: "odd" }), 6),
    ).toBeNull();
  });
});

describe("selectionRange", () => {
  it("compacts a run of consecutive pages into one token", () => {
    expect(selectionRange([1, 2, 3, 5])).toBe("1-3, 5");
  });

  it("writes a lone page as itself", () => {
    expect(selectionRange([7])).toBe("7");
    expect(selectionRange([2, 4, 6])).toBe("2, 4, 6");
  });

  it("compacts each run of a broken list", () => {
    expect(selectionRange([1, 2, 4, 5, 6, 9])).toBe("1-2, 4-6, 9");
  });

  it("writes nothing for an empty list", () => {
    expect(selectionRange([])).toBe("");
  });
});

describe("printSummary", () => {
  it("states the sides the layout will produce", () => {
    expect(printSummary(settings(), 12)).toBeNull();
    expect(printSummary(settings({ preset: "pagesPerSheet" }), 12)).toEqual([
      {
        key: "viewer.print.summaryPagesPerSheet",
        values: { pages: 12, sides: 3, count: 3 },
      },
      {
        key: "viewer.print.summaryPerSide",
        values: {
          perSheet: defaultPrintSettings().layout.pagesPerSheet,
          count: defaultPrintSettings().layout.pagesPerSheet,
        },
      },
    ]);
  });

  it("counts a custom grid by its rows and columns", () => {
    expect(
      printSummary(
        settings({ preset: "pagesPerSheet", layout: customLayout(2, 3) }),
        7,
      ),
    ).toEqual([
      {
        key: "viewer.print.summaryPagesPerSheet",
        values: { pages: 7, sides: 2, count: 2 },
      },
      {
        key: "viewer.print.summaryPerSide",
        values: { perSheet: 6, count: 6 },
      },
    ]);
  });

  it("keeps the document's pages apart from the blanks a booklet inserts", () => {
    expect(printSummary(settings({ preset: "booklet" }), 5)).toEqual([
      {
        key: "viewer.print.summaryBookletBlanks",
        values: { pages: 5, blanks: 3, count: 3 },
      },
      { key: "viewer.print.summaryBookletBothSides", values: {} },
    ]);
    expect(printSummary(settings({ preset: "booklet" }), 8)).toEqual([
      { key: "viewer.print.summaryBookletPages", values: { pages: 8 } },
      { key: "viewer.print.summaryBookletBothSides", values: {} },
    ]);
  });

  it("names the sides a manual pass prepares", () => {
    const manual = (duplexPass: "FIRST" | "SECOND") =>
      settings({
        preset: "booklet",
        booklet: {
          ...defaultPrintSettings().booklet,
          doubleSided: false,
          duplexPass,
        },
      });

    expect(printSummary(manual("FIRST"), 8)).toContainEqual({
      key: "viewer.print.summaryBookletFronts",
      values: {},
    });
    expect(printSummary(manual("SECOND"), 8)).toContainEqual({
      key: "viewer.print.summaryBookletBacks",
      values: {},
    });
  });

  it("counts the poster's tiles and names the paper they land on", () => {
    expect(printSummary(settings({ preset: "poster" }), 12)).toEqual([
      {
        key: "viewer.print.summaryPosterTiles",
        values: { pages: 12, tiles: 48, count: 48 },
      },
      {
        key: "viewer.print.summaryPosterGrid",
        values: { columns: 2, rows: 2, paper: "A4" },
      },
    ]);
  });

  it("says nothing for settings it cannot count", () => {
    expect(printSummary(settings({ preset: "booklet" }), 0)).toBeNull();
    expect(
      printSummary(
        settings({ preset: "poster", poster: posterSettings(0, 2) }),
        12,
      ),
    ).toBeNull();
    expect(
      printSummary(
        settings({ preset: "pagesPerSheet", layout: customLayout(0, 0) }),
        12,
      ),
    ).toBeNull();
  });
});

describe("bookletSides", () => {
  it("reads the sides of a folded sheet in print order", () => {
    expect(bookletSides(8, "LEFT")).toEqual([
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ]);
  });

  it("pads the document to the multiple of four a fold needs", () => {
    // The side carries the last page beside the first, and the page numbers
    // past a four page document are the blanks the imposition inserts.
    expect(bookletSides(4, "LEFT")).toEqual([
      [4, 1],
      [2, 3],
    ]);
    expect(bookletSides(12, "LEFT")).toEqual([
      [12, 1],
      [2, 11],
      [10, 3],
      [4, 9],
      [8, 5],
      [6, 7],
    ]);
  });

  it("mirrors the pair when the fold is on the right", () => {
    expect(bookletSides(4, "RIGHT")).toEqual([
      [1, 4],
      [3, 2],
    ]);
  });

  it("has no side for a document with no page", () => {
    expect(bookletSides(0, "LEFT")).toEqual([]);
  });
});
