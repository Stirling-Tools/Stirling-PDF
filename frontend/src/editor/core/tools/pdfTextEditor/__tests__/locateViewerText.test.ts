import { describe, it, expect } from "vitest";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { locateViewerText } from "@editor/tools/pdfTextEditor/util/locateViewerText";
import type {
  PageSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";

const HEIGHT = 800;

/** A run of `text` whose bottom-left corner sits at (x, y) in PDF space. */
function run(id: string, text: string, x = 0, y = 0): TextRunSnapshot {
  return {
    id,
    text,
    bounds: { x, y, width: 100, height: 10 },
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
    expect(found).toEqual({ runId: "b", range: { start: 6, end: 11 } });
  });

  it("takes the selection's first line, trimmed", () => {
    const found = locateViewerText(
      page([run("a", "First line"), run("b", "Second line")]),
      "  First line \nSecond line",
    );
    expect(found).toEqual({ runId: "a", range: { start: 0, end: 10 } });
  });

  it("falls back to the run holding the most of a line split across runs", () => {
    const found = locateViewerText(
      page([run("a", "Hello world"), run("b", "and more")]),
      "world and more",
    );
    expect(found).toEqual({ runId: "a", range: { start: 6, end: 11 } });
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
    expect(found?.runId).toBe("bottom");
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
    expect(found).toEqual({ runId: "a", range: { start: 25, end: 29 } });
  });

  it("picks the copy on the paragraph line the selection is on", () => {
    const para = {
      ...run("a", "2023 opens it and later 2023 closes", 0, 680),
      bounds: { x: 0, y: 680, width: 100, height: 30 },
      paragraphLineCount: 2,
    } as TextRunSnapshot;
    // Left end of the second line, the lower half of the box.
    const found = locateViewerText(page([para]), "2023", {
      x: 0,
      y: HEIGHT - 690,
      width: 15,
      height: 10,
    });
    expect(found?.range).toEqual({ start: 24, end: 28 });
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
    expect(found?.runId).toBe("top");
  });

  it("finds nothing for blank or absent text", () => {
    const p = page([run("a", "Hello")]);
    expect(locateViewerText(p, "  \n ")).toBeNull();
    expect(locateViewerText(p, "zzz")).toBeNull();
  });
});
