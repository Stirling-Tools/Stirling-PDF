import { describe, expect, it } from "vitest";
import { runsPushedBelow } from "@editor/tools/pdfTextEditor/commands/pushRunsBelow";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";

function run(id: string, x: number, y: number, width: number, height = 12) {
  return {
    id,
    bounds: { x, y, width, height },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: x, f: y },
    fontSize: 12,
    locked: false,
    containerPtr: 0,
    renderMode: 0,
    scanEdit: null,
  } as unknown as TextRun;
}

function page(runs: TextRun[], cellRuns: (string | null)[][] = []): Page {
  return {
    runs,
    tables: cellRuns.length
      ? [
          {
            cellRuns,
            cellExtraRuns: cellRuns.map((row) => row.map(() => null)),
          },
        ]
      : [],
    display: { cropBottom: 0 },
  } as unknown as Page;
}

// The edited run grew from bottom 500 down to 470: two 15pt lines.
const edited = () => run("edited", 50, 470, 300, 45);

describe("runsPushedBelow", () => {
  it("moves the line the new lines land on, and the one that then lands on", () => {
    const next = run("next", 50, 484, 300);
    const after = run("after", 50, 468, 300);
    expect(
      runsPushedBelow(page([edited(), next, after]), edited(), 500),
    ).toEqual({
      runIds: ["next", "after"],
      dy: -30,
    });
  });

  it("stops at a gap wide enough to take the added lines", () => {
    const next = run("next", 50, 484, 300);
    const far = run("far", 50, 300, 300);
    expect(
      runsPushedBelow(page([edited(), next, far]), edited(), 500).runIds,
    ).toEqual(["next"]);
  });

  it("leaves text in another column alone", () => {
    const beside = run("beside", 400, 484, 150);
    expect(
      runsPushedBelow(page([edited(), beside]), edited(), 500).runIds,
    ).toEqual([]);
  });

  it("does not reach into another column through a wide line it moves", () => {
    const footnote = run("footnote", 50, 484, 600);
    const otherColumn = run("other", 400, 468, 200);
    expect(
      runsPushedBelow(page([edited(), footnote, otherColumn]), edited(), 500)
        .runIds,
    ).toEqual(["footnote"]);
  });

  it("moves nothing when a wide line would land on the next column's text", () => {
    const wide = run("wide", 50, 484, 600);
    const nextColumn = run("next column", 420, 460, 200);
    expect(
      runsPushedBelow(page([edited(), wide, nextColumn]), edited(), 500).runIds,
    ).toEqual([]);
  });

  it("moves nothing when a table cell is in the way", () => {
    const next = run("next", 50, 484, 300);
    expect(
      runsPushedBelow(page([edited(), next], [["next"]]), edited(), 500).runIds,
    ).toEqual([]);
  });

  it("moves nothing when a line would be pushed off the page", () => {
    const next = run("next", 50, 20, 300, 470);
    expect(
      runsPushedBelow(page([edited(), next]), edited(), 500).runIds,
    ).toEqual([]);
  });

  it("does nothing when the run did not grow downwards", () => {
    const next = run("next", 50, 484, 300);
    const shrunk = run("edited", 50, 500, 300);
    expect(runsPushedBelow(page([shrunk, next]), shrunk, 500).runIds).toEqual(
      [],
    );
  });
});
