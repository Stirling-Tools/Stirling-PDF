import { describe, expect, it } from "vitest";

import { selectionPageIds } from "@editor/components/pageTracks/TrackRow";

describe("selectionPageIds", () => {
  it("targets the whole selection when the page is selected", () => {
    expect(selectionPageIds("a1", new Set(["a1", "b2"]))).toEqual(["a1", "b2"]);
  });

  it("targets only the page when it is outside the selection", () => {
    expect(selectionPageIds("a1", new Set(["b2"]))).toEqual(["a1"]);
  });

  it("targets only the page when nothing is selected", () => {
    expect(selectionPageIds("a1", new Set())).toEqual(["a1"]);
  });
});
