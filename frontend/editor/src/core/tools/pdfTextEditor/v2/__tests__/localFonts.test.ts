import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  groupByFamily,
  isLocalFontAccessSupported,
  listLocalFonts,
  resetLocalFontsCache,
} from "@app/tools/pdfTextEditor/v2/util/localFonts";
import type { LocalFont } from "@app/tools/pdfTextEditor/v2/util/localFonts";

type QueryStub = () => Promise<unknown[]>;

function setQuery(stub: QueryStub | null): void {
  const w = window as unknown as { queryLocalFonts?: QueryStub };
  if (stub) w.queryLocalFonts = stub;
  else delete w.queryLocalFonts;
}

function face(
  family: string,
  style: string,
  postscriptName: string,
): Record<string, string> {
  return { family, style, postscriptName, fullName: `${family} ${style}` };
}

function mkFont(family: string, style: string): LocalFont {
  return {
    family,
    style,
    fullName: `${family} ${style}`,
    postscriptName: `${family}-${style}`,
  };
}

beforeEach(() => {
  resetLocalFontsCache();
  setQuery(null);
});

afterEach(() => {
  resetLocalFontsCache();
  setQuery(null);
});

describe("isLocalFontAccessSupported", () => {
  it("is false when the API is missing", () => {
    expect(isLocalFontAccessSupported()).toBe(false);
  });

  it("is true when the API exists, without calling it", () => {
    const query = vi.fn<QueryStub>().mockResolvedValue([]);
    setQuery(query);
    expect(isLocalFontAccessSupported()).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("listLocalFonts", () => {
  it("returns null in a browser without the API", async () => {
    await expect(listLocalFonts()).resolves.toBeNull();
  });

  it("maps the faces the API returns", async () => {
    setQuery(
      vi
        .fn<QueryStub>()
        .mockResolvedValue([
          face("Inter", "Regular", "Inter-Regular"),
          face("Inter", "Bold", "Inter-Bold"),
        ]),
    );
    const fonts = await listLocalFonts();
    expect(fonts).toEqual([
      {
        family: "Inter",
        style: "Regular",
        postscriptName: "Inter-Regular",
        fullName: "Inter Regular",
      },
      {
        family: "Inter",
        style: "Bold",
        postscriptName: "Inter-Bold",
        fullName: "Inter Bold",
      },
    ]);
  });

  it("drops entries without a usable family", async () => {
    setQuery(
      vi
        .fn<QueryStub>()
        .mockResolvedValue([
          face("Inter", "Regular", "Inter-Regular"),
          { family: 42, style: "Regular" },
          { style: "Bold" },
          null,
        ]),
    );
    const fonts = await listLocalFonts();
    expect(fonts).toHaveLength(1);
    expect(fonts?.[0]?.family).toBe("Inter");
  });

  it("returns null when permission is denied", async () => {
    for (const name of ["SecurityError", "NotAllowedError"]) {
      resetLocalFontsCache();
      const error = new Error("denied");
      error.name = name;
      setQuery(vi.fn<QueryStub>().mockRejectedValue(error));
      await expect(listLocalFonts()).resolves.toBeNull();
    }
  });

  it("returns null when the API throws unexpectedly", async () => {
    setQuery(
      vi.fn<QueryStub>().mockImplementation(() => {
        throw new TypeError("boom");
      }),
    );
    await expect(listLocalFonts()).resolves.toBeNull();
  });

  it("returns null when the API resolves to a non-array", async () => {
    setQuery(
      vi.fn<QueryStub>().mockResolvedValue(undefined as unknown as unknown[]),
    );
    await expect(listLocalFonts()).resolves.toBeNull();
  });

  it("queries once per session so the prompt fires at most once", async () => {
    const query = vi
      .fn<QueryStub>()
      .mockResolvedValue([face("Inter", "Regular", "Inter-Regular")]);
    setQuery(query);

    const [first, second] = await Promise.all([
      listLocalFonts(),
      listLocalFonts(),
    ]);
    await listLocalFonts();

    expect(query).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    resetLocalFontsCache();
    await listLocalFonts();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("memoises a denial instead of re-prompting", async () => {
    const error = new Error("denied");
    error.name = "NotAllowedError";
    const query = vi.fn<QueryStub>().mockRejectedValue(error);
    setQuery(query);

    await expect(listLocalFonts()).resolves.toBeNull();
    await expect(listLocalFonts()).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("groupByFamily", () => {
  it("collapses faces into families sorted case-insensitively", () => {
    const grouped = groupByFamily([
      mkFont("inter", "Regular"),
      mkFont("Arial", "Bold"),
      mkFont("Zapfino", "Regular"),
      mkFont("bahnschrift", "Light"),
    ]);
    expect(grouped.map((f) => f.family)).toEqual([
      "Arial",
      "bahnschrift",
      "inter",
      "Zapfino",
    ]);
  });

  it("merges faces of one family and sorts its styles", () => {
    const grouped = groupByFamily([
      mkFont("Inter", "Regular"),
      mkFont("Inter", "Bold"),
      mkFont("inter", "Italic"),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.family).toBe("Inter");
    expect(grouped[0]?.styles).toEqual(["Bold", "Italic", "Regular"]);
  });

  it("de-duplicates styles case-insensitively and skips empty ones", () => {
    const grouped = groupByFamily([
      mkFont("Inter", "Bold"),
      mkFont("Inter", "bold"),
      mkFont("Inter", ""),
    ]);
    expect(grouped[0]?.styles).toEqual(["Bold"]);
  });

  it("returns an empty list for no faces", () => {
    expect(groupByFamily([])).toEqual([]);
  });
});
