import { describe, expect, it } from "vitest";
import {
  captureTextEditorHandoff,
  matchTextEditorHandoff,
  stagePendingEditorScroll,
  takePendingEditorScroll,
} from "@app/tools/pdfTextEditor/viewerHandoff";

// Each test captures under a unique identity, so no test can read another's
// module state and no reset seam is needed.
describe("viewerHandoff", () => {
  it("matches a capture by workbench file id", () => {
    captureTextEditorHandoff({
      fileId: "match-by-id",
      fileKey: "match-by-id|abc",
      zoomScale: 1.12,
      page: 3,
      offsetFraction: 0.5,
    });
    const h = matchTextEditorHandoff("match-by-id", "other");
    expect(h?.zoomScale).toBeCloseTo(1.12, 5);
    expect(h?.page).toBe(3);
  });

  it("falls back to the content key for files opened from disk", () => {
    captureTextEditorHandoff({
      fileId: null,
      fileKey: "disk-file|10|20",
      zoomScale: 1,
      page: 1,
      offsetFraction: 0,
    });
    expect(matchTextEditorHandoff(null, "disk-file|10|20")?.page).toBe(1);
    expect(matchTextEditorHandoff("other", "nope")).toBeNull();
  });

  it("clamps the carried zoom to the editor range", () => {
    captureTextEditorHandoff({
      fileId: "clamped-file",
      fileKey: "clamped-file",
      zoomScale: 9,
      page: 1,
      offsetFraction: 0,
    });
    expect(
      matchTextEditorHandoff("clamped-file", "clamped-file")?.zoomScale,
    ).toBeLessThanOrEqual(4);
  });

  it("ignores captures without a usable zoom or page", () => {
    captureTextEditorHandoff({
      fileId: "ignored-file",
      fileKey: "ignored-file",
      zoomScale: Number.NaN,
      page: 0,
      offsetFraction: 0,
    });
    expect(matchTextEditorHandoff("ignored-file", "ignored-file")).toBeNull();
  });

  it("hands the staged scroll target out exactly once", () => {
    stagePendingEditorScroll({ page: 2, offsetFraction: 0.25 });
    expect(takePendingEditorScroll()).toEqual({
      page: 2,
      offsetFraction: 0.25,
    });
    expect(takePendingEditorScroll()).toBeNull();
  });
});
