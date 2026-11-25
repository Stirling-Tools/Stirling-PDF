import { describe, expect, it } from "vitest";
import { headingTreeGuides } from "@editor/tools/pdfTextEditor/util/headingTree";

describe("headingTreeGuides", () => {
  it("branches each heading off its parent, closing the last child", () => {
    expect(headingTreeGuides([1, 2, 3, 3, 2])).toEqual([
      [],
      ["tee"],
      ["line", "tee"],
      ["line", "elbow"],
      ["elbow"],
    ]);
  });

  it("hangs a heading that skips a level off its parent", () => {
    expect(headingTreeGuides([1, 2, 3, 5, 2])).toEqual([
      [],
      ["tee"],
      ["line", "elbow"],
      ["line", "none", "elbow"],
      ["elbow"],
    ]);
  });

  it("starts a new tree at each top-level heading", () => {
    expect(headingTreeGuides([1, 2, 1, 2])).toEqual([
      [],
      ["elbow"],
      [],
      ["elbow"],
    ]);
  });

  it("places an unnumbered heading at the top level", () => {
    expect(headingTreeGuides([null, 2, null])).toEqual([[], ["elbow"], []]);
  });

  it("nests under a heading that starts deeper than Heading 1", () => {
    expect(headingTreeGuides([2, 3, 1])).toEqual([[], ["elbow"], []]);
  });
});
