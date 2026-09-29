import { describe, expect, it } from "vitest";
import {
  captureTextEditorHandoff,
  discardEditorPoster,
  matchTextEditorHandoff,
  recallEditorScroll,
  rememberEditorScroll,
  stageEditorPoster,
  stagePendingEditorScroll,
  stagePendingPoster,
  takeEditorPoster,
  takePendingEditorScroll,
  takePendingPoster,
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

  it("hands a poster out only for its file", () => {
    stageEditorPoster({
      fileId: "poster-file",
      fileKey: "poster-file|k",
      objectUrl: "blob:poster-file",
      pageIndex: 4,
    });
    expect(takeEditorPoster("other", "nope")).toBeNull();
    expect(takeEditorPoster("poster-file", "x")).toEqual({
      fileId: "poster-file",
      fileKey: "poster-file|k",
      objectUrl: "blob:poster-file",
      pageIndex: 4,
    });
    expect(takeEditorPoster("poster-file", "poster-file|k")).toBeNull();
  });

  it("drops a stale poster so it cannot leak into a later load", () => {
    stageEditorPoster({
      fileId: "stale-file",
      fileKey: "stale-file",
      objectUrl: "blob:stale-file",
      pageIndex: 0,
    });
    discardEditorPoster();
    expect(takeEditorPoster("stale-file", "stale-file")).toBeNull();
  });

  it("replaces a pending poster instead of stacking bitmaps", () => {
    stagePendingPoster({
      fileId: "pending-file",
      fileKey: "pending-file",
      objectUrl: "blob:pending-first",
      pageIndex: 0,
    });
    stagePendingPoster({
      fileId: "pending-file",
      fileKey: "pending-file",
      objectUrl: "blob:pending-second",
      pageIndex: 1,
    });
    expect(takePendingPoster()?.objectUrl).toBe("blob:pending-second");
    expect(takePendingPoster()).toBeNull();
  });

  it("remembers the scroll fraction per document", () => {
    const first = {};
    const second = {};
    rememberEditorScroll(first, 0.4);
    expect(recallEditorScroll(first)).toBeCloseTo(0.4, 5);
    expect(recallEditorScroll(second)).toBeNull();
    rememberEditorScroll(first, Number.NaN);
    expect(recallEditorScroll(first)).toBeCloseTo(0.4, 5);
  });
});
