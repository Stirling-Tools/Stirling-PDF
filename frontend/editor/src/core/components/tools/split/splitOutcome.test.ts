import { describe, expect, test } from "vitest";
import {
  computeSplitOutcome,
  pagesCutBySections,
  parsePageSelection,
} from "@app/components/tools/split/splitOutcome";
import {
  defaultParameters,
  type SplitParameters,
} from "@app/hooks/tools/split/useSplitParameters";
import { SPLIT_METHODS } from "@app/constants/splitConstants";

const params = (overrides: Partial<SplitParameters>): SplitParameters => ({
  ...defaultParameters,
  ...overrides,
});

describe("parsePageSelection", () => {
  test("expands commas and ranges to the pages they name", () => {
    expect(parsePageSelection("1, 3, 7-10", 20)).toEqual({
      ok: true,
      pages: [1, 3, 7, 8, 9, 10],
    });
  });

  test("all means every page", () => {
    expect(parsePageSelection("all", 4)).toEqual({
      ok: true,
      pages: [1, 2, 3, 4],
    });
  });

  test("rejects a page past the document", () => {
    expect(parsePageSelection("1, 21", 20)).toEqual({
      ok: false,
      reason: "out-of-range",
      value: "21",
    });
  });

  test("rejects expressions it cannot promise to expand", () => {
    expect(parsePageSelection("2n+1", 20)).toEqual({
      ok: false,
      reason: "token",
      value: "2n+1",
    });
  });
});

describe("computeSplitOutcome", () => {
  test("a cut after the last page does not make another file", () => {
    expect(
      computeSplitOutcome(
        params({ method: SPLIT_METHODS.BY_PAGES, pages: "10" }),
        10,
      ),
    ).toEqual({ kind: "parts", files: 1, breaks: [] });
  });

  test("each break adds a file", () => {
    expect(
      computeSplitOutcome(
        params({ method: SPLIT_METHODS.BY_PAGES, pages: "1,3" }),
        10,
      ),
    ).toEqual({ kind: "parts", files: 3, breaks: [1, 3] });
  });

  test("pages per file rounds the last file down", () => {
    expect(
      computeSplitOutcome(
        params({ method: SPLIT_METHODS.BY_PAGE_COUNT, splitValue: "5" }),
        21,
      ),
    ).toEqual({ kind: "uniform", files: 5, pagesPerFile: 5, lastFilePages: 1 });
  });

  test("document count spreads pages with the remainder first", () => {
    expect(
      computeSplitOutcome(
        params({ method: SPLIT_METHODS.BY_DOC_COUNT, splitValue: "3" }),
        20,
      ),
    ).toEqual({ kind: "even", files: 3, distribution: [7, 7, 6] });
  });

  test("document count cannot exceed the page count", () => {
    const outcome = computeSplitOutcome(
      params({ method: SPLIT_METHODS.BY_DOC_COUNT, splitValue: "30" }),
      20,
    );
    expect(outcome).toMatchObject({ kind: "even", files: 20 });
  });

  test("a size without a unit is still a size", () => {
    expect(
      computeSplitOutcome(
        params({ method: SPLIT_METHODS.BY_SIZE, splitValue: "10mb" }),
        10,
      ),
    ).toEqual({ kind: "by-size", size: "10MB" });
  });

  test("a size that is not a size is rejected", () => {
    expect(
      computeSplitOutcome(
        params({ method: SPLIT_METHODS.BY_SIZE, splitValue: "lots" }),
        10,
      ),
    ).toEqual({ kind: "invalid-value" });
  });

  test("sections count rows and columns, not cut lines", () => {
    expect(
      computeSplitOutcome(
        params({ method: SPLIT_METHODS.BY_SECTIONS, hDiv: "2", vDiv: "2" }),
        10,
      ),
    ).toEqual({
      kind: "pieces",
      files: 90,
      piecesPerPage: 9,
      rows: 3,
      columns: 3,
      cutPages: 10,
      totalPages: 10,
      merged: false,
    });
  });

  test("merging sections keeps one file", () => {
    const outcome = computeSplitOutcome(
      params({
        method: SPLIT_METHODS.BY_SECTIONS,
        hDiv: "1",
        vDiv: "1",
        merge: true,
      }),
      10,
    );
    expect(outcome).toMatchObject({ kind: "pieces", files: 1, merged: true });
  });

  test("poster tiles multiply pages by the grid", () => {
    expect(
      computeSplitOutcome(
        params({
          method: SPLIT_METHODS.BY_POSTER,
          xFactor: "2",
          yFactor: "2",
        }),
        10,
      ),
    ).toEqual({
      kind: "poster",
      files: 40,
      tilesPerPage: 4,
      rows: 2,
      columns: 2,
      pageSize: "A4",
    });
  });

  test("nothing is promised before a method is chosen", () => {
    expect(computeSplitOutcome(params({ method: null }), 10)).toEqual({
      kind: "none",
    });
  });
});

describe("pagesCutBySections", () => {
  test("except-first skips page 1", () => {
    expect(pagesCutBySections("SPLIT_ALL_EXCEPT_FIRST", "", 4)).toEqual([
      2, 3, 4,
    ]);
  });

  test("custom pages are the ones cut", () => {
    expect(pagesCutBySections("CUSTOM", "2,4", 5)).toEqual([2, 4]);
  });
});
