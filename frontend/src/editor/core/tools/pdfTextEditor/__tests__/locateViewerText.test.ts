import { describe, it, expect } from "vitest";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { locateViewerText } from "@editor/tools/pdfTextEditor/util/locateViewerText";
import type {
  PageSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";

const HEIGHT = 800;

/** A run of `text` whose bottom-left corner sits at (x, y) in PDF space. */
function run(
  id: string,
  text: string,
  x = 0,
  y = 0,
  height = 10,
): TextRunSnapshot {
  return {
    id,
    text,
    bounds: { x, y, width: 100, height },
  } as TextRunSnapshot;
}

function page(runs: TextRunSnapshot[], rotate = 0): PageSnapshot {
  const display = { ...DisplayTransform.identity(600, HEIGHT), rotate };
  return { pageIndex: 0, runs, display } as unknown as PageSnapshot;
}

describe("locateViewerText", () => {
  it("selects the span of a run that holds the whole selection", () => {
    const found = locateViewerText(
      page([run("a", "Intro"), run("b", "Hello brave world")]),
      "brave",
    );
    expect(found).toEqual([{ runId: "b", range: { start: 6, end: 11 } }]);
  });

  it("selects every run holding a multi-line selection", () => {
    const found = locateViewerText(
      page([run("a", "First line"), run("b", "Second line")]),
      "  First line \nSecond line",
    );
    expect(found).toEqual([
      { runId: "a", range: { start: 0, end: 10 } },
      { runId: "b", range: { start: 0, end: 11 } },
    ]);
  });

  it("selects a wrapped span inside one paragraph run", () => {
    const found = locateViewerText(
      page([run("a", "The quick brown\nfox jumps")]),
      "quick brown\nfox",
    );
    expect(found).toEqual([{ runId: "a", range: { start: 4, end: 19 } }]);
  });

  it("spans a selection split across runs", () => {
    const found = locateViewerText(
      page([run("a", "Hello world"), run("b", "and more")]),
      "world and more",
    );
    expect(found).toEqual([
      { runId: "a", range: { start: 6, end: 11 } },
      { runId: "b", range: { start: 0, end: 8 } },
    ]);
  });

  it("falls back to the run holding the most of an unmatched line", () => {
    const found = locateViewerText(
      page([run("a", "Hello world"), run("b", "and more")]),
      "Hello world and more!",
    );
    expect(found).toEqual([{ runId: "a", range: { start: 0, end: 11 } }]);
  });

  it("picks the repeat nearest the viewer's selection", () => {
    const p = page([run("top", "the", 0, 700), run("bottom", "the", 0, 100)]);
    // 690px from the top is near the bottom run (y 100..110 from the bottom).
    const found = locateViewerText(p, "the", {
      x: 0,
      y: HEIGHT - 110,
      width: 100,
      height: 10,
    });
    expect(found?.[0].runId).toBe("bottom");
  });

  it("picks the multi-run copy nearest the viewer's selection", () => {
    const p = page([
      run("top-1", "Alpha", 0, 700),
      run("top-2", "Beta", 0, 690),
      run("bottom-1", "Alpha", 0, 100),
      run("bottom-2", "Beta", 0, 90),
    ]);
    const found = locateViewerText(p, "Alpha\nBeta", {
      x: 0,
      y: HEIGHT - 100,
      width: 100,
      height: 10,
    });
    expect(found?.map((span) => span.runId)).toEqual(["bottom-1", "bottom-2"]);
  });

  it("picks the copy within a run nearest the viewer's selection", () => {
    // One line, x 0..100: the second "2023" sits at the far right.
    const p = page([run("a", "2023 then more words and 2023", 0, 700)]);
    const found = locateViewerText(p, "2023", {
      x: 85,
      y: HEIGHT - 710,
      width: 15,
      height: 10,
    });
    expect(found).toEqual([{ runId: "a", range: { start: 25, end: 29 } }]);
  });

  it("picks the copy on the paragraph line the selection is on", () => {
    const para = {
      ...run("a", "2023 opens it and later 2023 closes", 0, 680, 30),
      paragraphLineCount: 2,
    } as TextRunSnapshot;
    // Left end of the second line, the lower half of the box.
    const found = locateViewerText(page([para]), "2023", {
      x: 0,
      y: HEIGHT - 690,
      width: 15,
      height: 10,
    });
    expect(found?.[0].range).toEqual({ start: 24, end: 28 });
  });

  it("keeps the first repeat on a rotated page", () => {
    const p = page(
      [run("top", "the", 0, 700), run("bottom", "the", 0, 100)],
      1,
    );
    const found = locateViewerText(p, "the", {
      x: 0,
      y: HEIGHT - 110,
      width: 100,
      height: 10,
    });
    expect(found?.[0].runId).toBe("top");
  });

  it("finds nothing for blank or absent text", () => {
    const p = page([run("a", "Hello")]);
    expect(locateViewerText(p, "  \n ")).toBeNull();
    expect(locateViewerText(p, "zzz")).toBeNull();
  });
});
