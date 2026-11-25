import { describe, expect, it } from "vitest";
import {
  runsPulledBack,
  runsPushedBelow,
  setPushRecords,
} from "@editor/tools/pdfTextEditor/commands/pushRunsBelow";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";

function run(id: string, x: number, y: number, width: number, height = 12) {
  return {
    id,
    text: "x",
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
    findRun: (id: string) => runs.find((r) => r.id === id),
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

  it("moves a line the new lines stop only just short of", () => {
    // The edited run's new bottom is 470; a line topping out at 469.5 clears it by less than a tenth of an em.
    const justBelow = run("just below", 50, 457.5, 300);
    expect(
      runsPushedBelow(page([edited(), justBelow]), edited(), 500).runIds,
    ).toEqual(["just below"]);
  });

  it("leaves a line the new lines clear by a tenth of an em or more", () => {
    const clear = run("clear", 50, 456, 300);
    expect(
      runsPushedBelow(page([edited(), clear]), edited(), 500).runIds,
    ).toEqual([]);
  });

  it("leaves text in another column alone", () => {
    const beside = run("beside", 400, 484, 150);
    expect(
      runsPushedBelow(page([edited(), beside]), edited(), 500).runIds,
    ).toEqual([]);
  });

  it("leaves the column beside the edited text alone, down to a full-width line under both", () => {
    const leftLine = run("left line", 50, 484, 300);
    const rightLines = [
      run("right 1", 400, 500, 200),
      run("right 2", 400, 484, 200),
      run("right 3", 400, 440, 200),
    ];
    const footnote = run("footnote", 50, 468, 600);
    expect(
      runsPushedBelow(
        page([edited(), leftLine, ...rightLines, footnote]),
        edited(),
        500,
      ).runIds,
    ).toEqual(["left line", "footnote", "right 3"]);
  });

  it("takes a line outside the edited width that a moved line comes down on", () => {
    const wide = run("wide", 50, 484, 400);
    const rightAligned = run("right aligned", 380, 466, 200);
    expect(
      runsPushedBelow(page([edited(), wide, rightAligned]), edited(), 500)
        .runIds,
    ).toEqual(["wide", "right aligned"]);
  });

  it("takes a line a moved line would pass right over", () => {
    const wide = run("wide", 50, 484, 600);
    const passed = run("passed over", 400, 468, 200);
    expect(
      runsPushedBelow(page([edited(), wide, passed]), edited(), 500).runIds,
    ).toEqual(["wide", "passed over"]);
  });

  it("takes a piece drawn separately among the lines of a moved paragraph", () => {
    const paragraph = run("paragraph", 50, 400, 500, 96);
    const piece = run("piece", 420, 430, 100);
    expect(
      runsPushedBelow(page([edited(), paragraph, piece]), edited(), 500).runIds,
    ).toEqual(["paragraph", "piece"]);
  });

  // The overlay draws a line's box a line height tall and a descender deeper
  // than its ink, so ink that clears by under a point still puts the moved
  // line's box over the one below, and the box on top takes the clicks.
  it("takes a line whose box a moved line's box would come down on", () => {
    const next = run("next", 50, 484, 300);
    const list = run("list", 70, 440.3, 200);
    expect(
      runsPushedBelow(page([edited(), next, list]), edited(), 500).runIds,
    ).toEqual(["next", "list"]);
  });

  it("leaves a line beside a moved line where it is when nothing comes down on it", () => {
    const narrow = run("narrow", 50, 484, 300);
    const beside = run("beside", 400, 484, 200);
    expect(
      runsPushedBelow(page([edited(), narrow, beside]), edited(), 500).runIds,
    ).toEqual(["narrow"]);
  });

  it("moves nothing when a line a moved line comes down on cannot move", () => {
    const wide = run("wide", 50, 484, 400);
    const rightAligned = run("right aligned", 380, 466, 200);
    rightAligned.locked = true;
    expect(
      runsPushedBelow(page([edited(), wide, rightAligned]), edited(), 500)
        .runIds,
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

describe("runsPulledBack", () => {
  // Two 15pt lines were added to a one-line run: the first moved `near`, the second moved `near` again and reached `far`.
  function pushedTwice() {
    const runs = [
      edited(),
      run("near", 50, 454, 300),
      run("far", 50, 420, 300),
    ];
    setPushRecords(runs[0], [
      { lineCount: 2, linesAdded: 1, runIds: ["near"], dy: -15 },
      { lineCount: 3, linesAdded: 1, runIds: ["near", "far"], dy: -15 },
    ]);
    return { page: page(runs), edited: runs[0] };
  }

  it("takes back only what the line that went had pushed", () => {
    const { page: p, edited: e } = pushedTwice();
    expect(runsPulledBack(p, e, 2)).toEqual({
      moves: [
        { runId: "near", dy: 15 },
        { runId: "far", dy: 15 },
      ],
      records: [{ lineCount: 2, linesAdded: 1, runIds: ["near"], dy: -15 }],
    });
  });

  it("takes everything back when every added line goes", () => {
    const { page: p, edited: e } = pushedTwice();
    expect(runsPulledBack(p, e, 1)).toEqual({
      moves: [
        { runId: "near", dy: 30 },
        { runId: "far", dy: 15 },
      ],
      records: [],
    });
  });

  it("takes nothing back while the lines that pushed are all still there", () => {
    const { page: p, edited: e } = pushedTwice();
    expect(runsPulledBack(p, e, 3).moves).toEqual([]);
    expect(runsPulledBack(p, e, 5).records).toHaveLength(2);
  });

  it("takes back a share of a push made for several lines at once", () => {
    const runs = [edited(), run("near", 50, 454, 300)];
    setPushRecords(runs[0], [
      { lineCount: 4, linesAdded: 3, runIds: ["near"], dy: -45 },
    ]);
    const { moves, records } = runsPulledBack(page(runs), runs[0], 3);
    expect(moves).toHaveLength(1);
    expect(moves[0].dy).toBeCloseTo(15, 6);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ lineCount: 3, linesAdded: 2 });
    expect(records[0].dy).toBeCloseTo(-30, 6);
  });

  it("leaves a run that can no longer move", () => {
    const { page: p, edited: e } = pushedTwice();
    p.findRun("near")!.locked = true;
    expect(runsPulledBack(p, e, 1).moves).toEqual([{ runId: "far", dy: 15 }]);
  });
});

describe("invisible text", () => {
  const invisible = (hiddenText: boolean) => {
    const r = run("invisible", 50, 484, 300);
    Object.assign(r, { renderMode: 3, hiddenText });
    return r;
  };

  it("moves invisible text with no picture behind it", () => {
    expect(
      runsPushedBelow(page([edited(), invisible(true)]), edited(), 500).runIds,
    ).toEqual(["invisible"]);
  });

  it("leaves an OCR layer over a scan where it is", () => {
    expect(
      runsPushedBelow(page([edited(), invisible(false)]), edited(), 500).runIds,
    ).toEqual([]);
  });
});
