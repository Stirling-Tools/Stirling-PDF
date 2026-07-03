import { describe, expect, test } from "vitest";
import {
  buildSplitFormData,
  getSplitEndpoint,
  splitFromApiParams,
  splitToApiParams,
} from "@app/hooks/tools/split/useSplitOperation";
import {
  SplitParameters,
  defaultParameters,
} from "@app/hooks/tools/split/useSplitParameters";
import { SPLIT_METHODS } from "@app/constants/splitConstants";

const params = (overrides: Partial<SplitParameters>): SplitParameters => ({
  ...defaultParameters,
  ...overrides,
});

describe("splitToApiParams", () => {
  test("byPages sends pageNumbers", () => {
    expect(
      splitToApiParams(
        params({ method: SPLIT_METHODS.BY_PAGES, pages: "2,5" }),
      ),
    ).toEqual({ pageNumbers: "2,5" });
  });

  test("bySections sends divisions and split mode without custom pages", () => {
    expect(
      splitToApiParams(
        params({
          method: SPLIT_METHODS.BY_SECTIONS,
          hDiv: "3",
          vDiv: "2",
          merge: true,
          splitMode: "SPLIT_ALL",
        }),
      ),
    ).toEqual({
      horizontalDivisions: 3,
      verticalDivisions: 2,
      merge: true,
      splitMode: "SPLIT_ALL",
    });
  });

  test("bySections includes pageNumbers only for CUSTOM mode", () => {
    expect(
      splitToApiParams(
        params({
          method: SPLIT_METHODS.BY_SECTIONS,
          splitMode: "CUSTOM",
          customPages: "1,2",
        }),
      ),
    ).toMatchObject({ splitMode: "CUSTOM", pageNumbers: "1,2" });
  });

  test.each([
    { method: SPLIT_METHODS.BY_SIZE, splitType: 0 },
    { method: SPLIT_METHODS.BY_PAGE_COUNT, splitType: 1 },
    { method: SPLIT_METHODS.BY_DOC_COUNT, splitType: 2 },
  ])("$method maps to splitType $splitType", ({ method, splitType }) => {
    expect(splitToApiParams(params({ method, splitValue: "5" }))).toEqual({
      splitType,
      splitValue: "5",
    });
  });

  test("byChapters converts bookmarkLevel to a number", () => {
    expect(
      splitToApiParams(
        params({
          method: SPLIT_METHODS.BY_CHAPTERS,
          bookmarkLevel: "2",
          includeMetadata: true,
        }),
      ),
    ).toEqual({
      bookmarkLevel: 2,
      includeMetadata: true,
      allowDuplicates: false,
    });
  });

  test("byPageDivider sends duplexMode", () => {
    expect(
      splitToApiParams(
        params({ method: SPLIT_METHODS.BY_PAGE_DIVIDER, duplexMode: true }),
      ),
    ).toEqual({ duplexMode: true });
  });

  test("byPoster uses the spec's lower-case factor field names", () => {
    expect(
      splitToApiParams(
        params({
          method: SPLIT_METHODS.BY_POSTER,
          pageSize: "A4",
          xFactor: "3",
          yFactor: "2",
          rightToLeft: true,
        }),
      ),
    ).toEqual({ pageSize: "A4", xfactor: 3, yfactor: 2, rightToLeft: true });
  });
});

describe("split round-trip", () => {
  test.each<Partial<SplitParameters>>([
    { method: SPLIT_METHODS.BY_PAGES, pages: "2,5" },
    {
      method: SPLIT_METHODS.BY_SECTIONS,
      hDiv: "3",
      vDiv: "2",
      merge: true,
      splitMode: "SPLIT_ALL",
    },
    {
      method: SPLIT_METHODS.BY_SECTIONS,
      splitMode: "CUSTOM",
      customPages: "1,2",
    },
    { method: SPLIT_METHODS.BY_SIZE, splitValue: "10MB" },
    { method: SPLIT_METHODS.BY_PAGE_COUNT, splitValue: "5" },
    { method: SPLIT_METHODS.BY_DOC_COUNT, splitValue: "3" },
    {
      method: SPLIT_METHODS.BY_CHAPTERS,
      bookmarkLevel: "2",
      includeMetadata: true,
    },
    { method: SPLIT_METHODS.BY_PAGE_DIVIDER, duplexMode: true },
    {
      method: SPLIT_METHODS.BY_POSTER,
      pageSize: "A4",
      xFactor: "3",
      yFactor: "2",
    },
  ])("toApiParams(fromApiParams(x)) reproduces x for %o", (overrides) => {
    const api = splitToApiParams(params(overrides));
    const roundTripped = splitToApiParams(params(splitFromApiParams(api)));

    expect(roundTripped).toEqual(api);
  });
});

describe("getSplitEndpoint", () => {
  test.each([
    { method: SPLIT_METHODS.BY_PAGES, endpoint: "/api/v1/general/split-pages" },
    {
      method: SPLIT_METHODS.BY_SECTIONS,
      endpoint: "/api/v1/general/split-pdf-by-sections",
    },
    {
      method: SPLIT_METHODS.BY_SIZE,
      endpoint: "/api/v1/general/split-by-size-or-count",
    },
    {
      method: SPLIT_METHODS.BY_CHAPTERS,
      endpoint: "/api/v1/general/split-pdf-by-chapters",
    },
    {
      method: SPLIT_METHODS.BY_PAGE_DIVIDER,
      endpoint: "/api/v1/misc/auto-split-pdf",
    },
    {
      method: SPLIT_METHODS.BY_POSTER,
      endpoint: "/api/v1/general/split-for-poster-print",
    },
  ])("$method routes to $endpoint", ({ method, endpoint }) => {
    expect(getSplitEndpoint(params({ method }))).toBe(endpoint);
  });
});

describe("buildSplitFormData", () => {
  test("appends the file and the serialized parameters", () => {
    const file = new File(["x"], "test.pdf", { type: "application/pdf" });
    const formData = buildSplitFormData(
      params({ method: SPLIT_METHODS.BY_PAGES, pages: "3" }),
      file,
    );

    expect(formData.get("fileInput")).toBe(file);
    expect(formData.get("pageNumbers")).toBe("3");
  });
});
