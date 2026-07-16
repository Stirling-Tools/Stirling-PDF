import { describe, expect, it } from "vitest";
import { extractHeadings, slugify } from "@portal/docs/headings";

describe("slugify", () => {
  it("lowercases, hyphenates, and trims punctuation", () => {
    expect(slugify("How it Works!")).toBe("how-it-works");
    expect(slugify("  Trailing & spaces  ")).toBe("trailing-spaces");
  });
});

describe("extractHeadings", () => {
  it("extracts H2/H3 only, with slugs matching the rendered ids", () => {
    const md = [
      "# Page Title",
      "## How it Works",
      "text",
      "### Sub Section",
      "#### Too Deep",
      "## Operations",
    ].join("\n");
    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "How it Works", slug: "how-it-works" },
      { level: 3, text: "Sub Section", slug: "sub-section" },
      { level: 2, text: "Operations", slug: "operations" },
    ]);
  });

  it("de-duplicates repeated heading text into unique slugs", () => {
    const md = ["## What Changed", "### What Changed", "## What Changed"].join(
      "\n",
    );
    expect(extractHeadings(md).map((h) => h.slug)).toEqual([
      "what-changed",
      "what-changed-1",
      "what-changed-2",
    ]);
  });

  it("ignores headings inside fenced code and strips inline marks", () => {
    const md = ["```", "## not a heading", "```", "## `Code` and *em*"].join(
      "\n",
    );
    expect(extractHeadings(md)).toEqual([
      { level: 2, text: "Code and em", slug: "code-and-em" },
    ]);
  });
});
