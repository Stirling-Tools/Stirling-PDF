import { describe, it, expect } from "vitest";
import {
  bandByRules,
  clusterRowPins,
  columnPins,
  detectTables,
  rowPins,
  rowSpans,
} from "@app/tools/pdfTextEditor/util/tableDetection";
import type { TextRunSnapshot } from "@app/tools/pdfTextEditor/types";

let seq = 0;
function run(
  x: number,
  y: number,
  width: number,
  text: string,
  extra: Partial<TextRunSnapshot> = {},
): TextRunSnapshot {
  return {
    id: `r${seq++}`,
    pageIndex: 0,
    bounds: { x, y, width, height: 12 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: x, f: y },
    text,
    fontId: "base14:Helvetica",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    ...extra,
  };
}

// Build a grid: rows top-down at descending y, columns at the given x lefts.
function grid(
  xs: number[],
  topY: number,
  rowGap: number,
  cells: string[][],
): TextRunSnapshot[] {
  const runs: TextRunSnapshot[] = [];
  cells.forEach((rowCells, r) => {
    const y = topY - r * rowGap;
    rowCells.forEach((text, c) => {
      if (text) runs.push(run(xs[c], y, 60, text));
    });
  });
  return runs;
}

describe("detectTables", () => {
  it("returns nothing for empty input", () => {
    expect(detectTables([], 0)).toEqual([]);
  });

  it("recognizes a clean 3x3 invoice grid", () => {
    const runs = grid([50, 200, 350], 700, 20, [
      ["Item", "Qty", "Price"],
      ["Widget", "2", "$10.00"],
      ["Gadget", "5", "$25.00"],
    ]);
    const tables = detectTables(runs, 0);
    expect(tables).toHaveLength(1);
    const t = tables[0];
    expect(t.rows).toBe(3);
    expect(t.cols).toBe(3);
    expect(t.cells).toHaveLength(9);
    // Header row cells map to the right runs.
    const a1 = t.cells.find((c) => c.row === 0 && c.col === 0);
    expect(a1?.runIds).toHaveLength(1);
    expect(t.colEdges).toHaveLength(4);
    expect(t.rowEdges).toHaveLength(4);
  });

  it("does not treat a paragraph of prose as a table", () => {
    // One run per line, all starting at the same left margin: a single column.
    const runs: TextRunSnapshot[] = [];
    for (let i = 0; i < 6; i++) {
      runs.push(run(72, 700 - i * 16, 400, `Line ${i} of ordinary prose text`));
    }
    expect(detectTables(runs, 0)).toEqual([]);
  });

  it("separates two tables split by a large vertical gap", () => {
    const top = grid([50, 200], 700, 18, [
      ["A", "B"],
      ["C", "D"],
    ]);
    // 200pt gap below the first table.
    const bottom = grid([50, 200], 460, 18, [
      ["E", "F"],
      ["G", "H"],
    ]);
    const tables = detectTables([...top, ...bottom], 0);
    expect(tables).toHaveLength(2);
    expect(tables[0].bounds.y).toBeGreaterThan(tables[1].bounds.y);
  });

  it("detects the table but ignores a heading and trailing paragraph", () => {
    const heading = [run(72, 760, 300, "Quarterly Results")];
    const table = grid([72, 220, 380], 700, 20, [
      ["Region", "Q1", "Q2"],
      ["North", "100", "120"],
      ["South", "90", "110"],
    ]);
    const paragraph: TextRunSnapshot[] = [];
    for (let i = 0; i < 3; i++) {
      paragraph.push(
        run(72, 560 - i * 16, 420, `Footnote line ${i} explaining`),
      );
    }
    const tables = detectTables([...heading, ...table, ...paragraph], 0);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toBe(3);
    expect(tables[0].cols).toBe(3);
  });

  it("tolerates slight baseline drift within a row", () => {
    const runs = [
      run(50, 701, 60, "Name"),
      run(200, 699, 60, "Score"),
      run(50, 681, 60, "Alice"),
      run(200, 680, 60, "42"),
      run(50, 660, 60, "Bob"),
      run(200, 661, 60, "37"),
    ];
    const tables = detectTables(runs, 0);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toBe(3);
    expect(tables[0].cols).toBe(2);
  });

  it("ignores multi-line paragraph runs as cell content", () => {
    const runs = grid([50, 200], 700, 20, [
      ["A", "B"],
      ["C", "D"],
    ]);
    runs[0] = { ...runs[0], paragraphLineCount: 4 };
    // With one corner run consumed by a paragraph, the grid loses a column in
    // that row but the remaining rows still form a 2-col table.
    const tables = detectTables(runs, 0);
    expect(tables.length).toBeLessThanOrEqual(1);
  });

  it("recognizes right-aligned numeric columns (varying left edges)", () => {
    // Label column left-aligned at x=60; amount column right-aligned to x=300.
    const runs = [
      run(60, 700, 80, "Opening balance"),
      run(285, 700, 15, "5"),
      run(60, 680, 80, "Deposits"),
      run(255, 680, 45, "1,200"),
      run(60, 660, 80, "Fees"),
      run(272, 660, 28, "37"),
    ];
    const tables = detectTables(runs, 0);
    expect(tables).toHaveLength(1);
    expect(tables[0].cols).toBe(2);
    expect(tables[0].rows).toBe(3);
    // All three amounts land in the second column.
    const col1Runs = tables[0].cells
      .filter((c) => c.col === 1)
      .flatMap((c) => c.runIds);
    expect(col1Runs).toHaveLength(3);
  });

  it("handles a wide 4-column table with a partially empty row", () => {
    const runs = grid([40, 140, 260, 400], 700, 18, [
      ["SKU", "Name", "Qty", "Total"],
      ["001", "Bolt", "10", "$5"],
      ["002", "Nut", "", "$3"],
      ["003", "Washer", "20", "$8"],
    ]);
    const tables = detectTables(runs, 0);
    expect(tables).toHaveLength(1);
    expect(tables[0].cols).toBe(4);
    expect(tables[0].rows).toBe(4);
  });

  // A column merged into one paragraph run, exactly as the editor's grouping
  // hands it over: one run, N lines, real baselines and lefts.
  function column(
    lines: string[],
    left: number,
    topBaseline: number,
    lineGap: number,
    width: number,
    lefts?: number[],
  ): TextRunSnapshot {
    const baselines = lines.map((_, i) => topBaseline - i * lineGap);
    const bottom = baselines[baselines.length - 1] - 2;
    const height = topBaseline + 10 - bottom;
    return run(left, bottom, width, lines.join("\n"), {
      bounds: { x: left, y: bottom, width, height },
      paragraphLineCount: lines.length,
      paragraphLineHeight: lineGap,
      paragraphBaselines: baselines,
      paragraphLineLefts: lefts ?? lines.map(() => left),
    });
  }

  it("splits paragraph-merged columns into per-cell candidates", () => {
    // Three columns, each arriving as ONE run of four lines - the shape the
    // editor actually produces for a table.
    const runs = [
      column(["Region", "EMEA", "APAC", "LATAM"], 60, 700, 18, 50),
      column(["2025", "812", "398", "88"], 200, 700, 18, 30),
      column(["2026", "905", "441", "91"], 320, 700, 18, 30),
    ];
    const [table] = detectTables(runs, 0);
    expect(table).toBeDefined();
    expect({ rows: table.rows, cols: table.cols }).toEqual({
      rows: 4,
      cols: 3,
    });
    // Every cell is backed by its own line, so all 12 are occupied.
    expect(table.cells.filter((c) => c.runIds.length > 0)).toHaveLength(12);
  });

  it("skips a paragraph run with no per-line baselines", () => {
    const bad = run(60, 600, 50, "a\nb\nc", {
      paragraphLineCount: 3,
      bounds: { x: 60, y: 600, width: 50, height: 54 },
    });
    expect(detectTables([bad, run(200, 640, 30, "x")], 0)).toEqual([]);
  });

  it("keeps a left-aligned header and its right-aligned numbers in one column", () => {
    // The header sits left in the band, the values right, with clear whitespace
    // between them - that gap must not split the column in two.
    const runs = [
      column(["Region", "EMEA", "APAC"], 60, 700, 18, 50),
      run(200, 692, 12, "Q1"),
      column(["812,400", "398,220"], 228, 682, 18, 38),
      run(300, 692, 12, "Q2"),
      column(["905,120", "441,000"], 328, 682, 18, 38),
    ];
    const [table] = detectTables(runs, 0);
    expect(table).toBeDefined();
    expect(table.cols).toBe(3);
  });

  it("drops a heading above the grid and prose below it", () => {
    const runs = [
      run(60, 736, 120, "Table A: Headcount"),
      ...grid([60, 200, 320], 718, 18, [
        ["Team", "2025", "2026"],
        ["Engineering", "22", "31"],
        ["Design", "4", "6"],
      ]),
      run(60, 646, 300, "A sentence that follows the table closely."),
    ];
    const [table] = detectTables(runs, 0);
    expect(table).toBeDefined();
    expect({ rows: table.rows, cols: table.cols }).toEqual({
      rows: 3,
      cols: 3,
    });
  });

  // A 3x3 block of single-line cells, used by the snapping tests below.
  const BLOCK = () =>
    grid([60, 200, 320], 700, 20, [
      ["A1", "B1", "C1"],
      ["A2", "B2", "C2"],
      ["A3", "B3", "C3"],
    ]);

  /** A hairline rule box: vertical at x, or horizontal at y. */
  const vRule = (x: number, from: number, to: number) => ({
    x: x - 0.25,
    y: from,
    width: 0.5,
    height: to - from,
  });
  const hRule = (y: number, from: number, to: number) => ({
    x: from,
    y: y - 0.25,
    width: to - from,
    height: 0.5,
  });

  it("gives the outer edges the same margin as the gaps between tracks", () => {
    const [table] = detectTables(BLOCK(), 0);
    // Text spans x 60..380; the boundary must clear it, not sit on the glyphs.
    expect(table.colEdges[0]).toBeLessThan(60);
    expect(table.colEdges[table.cols]).toBeGreaterThan(380);
    expect(table.pageRuled).toBe(false);
  });

  it("snaps the grid onto the rules the page actually draws", () => {
    const rules = [
      vRule(50, 640, 730),
      vRule(150, 640, 730),
      vRule(300, 640, 730),
      vRule(400, 640, 730),
      hRule(716, 40, 420),
      hRule(696, 40, 420),
      hRule(676, 40, 420),
      hRule(656, 40, 420),
    ];
    const [table] = detectTables(BLOCK(), 0, {}, rules);
    expect(table.colEdges).toEqual([50, 150, 300, 400]);
    expect(table.rowEdges).toEqual([716, 696, 676, 656]);
    // Cells follow the drawn grid, so the overlay lands on the printed lines.
    expect(table.bounds.x).toBe(50);
    expect(table.bounds.width).toBe(350);
    expect(table.pageRuled).toBe(true);
  });

  it("ignores rules that do not run along the table", () => {
    // A short underline under one cell, and a rule far above the block.
    const rules = [vRule(150, 695, 700), hRule(900, 40, 420)];
    const plain = detectTables(BLOCK(), 0)[0];
    const withStrays = detectTables(BLOCK(), 0, {}, rules)[0];
    expect(withStrays.colEdges).toEqual(plain.colEdges);
    expect(withStrays.rowEdges).toEqual(plain.rowEdges);
    expect(withStrays.pageRuled).toBe(false);
  });

  it("keeps the derived grid when the drawn rules are an incomplete set", () => {
    // One interior rule only: snap that edge, leave the rest, claim nothing.
    const rules = [vRule(150, 640, 730)];
    const table = detectTables(BLOCK(), 0, {}, rules)[0];
    expect(table.colEdges).toContain(150);
    expect(table.cols).toBe(3);
    expect(table.pageRuled).toBe(false);
  });

  it("joins the per-cell edges of a stroked grid into whole rules", () => {
    // Word and Chrome stroke a rectangle per cell, so each boundary arrives in
    // one-row pieces. Unjoined, no piece spans enough of the table to count.
    const rules = [];
    const xs = [50, 150, 300, 400];
    const ys = [716, 696, 676, 656];
    for (let r = 0; r < ys.length - 1; r++) {
      for (let c = 0; c < xs.length - 1; c++) {
        rules.push(vRule(xs[c], ys[r + 1], ys[r]));
        rules.push(vRule(xs[c + 1], ys[r + 1], ys[r]));
        rules.push(hRule(ys[r], xs[c], xs[c + 1]));
        rules.push(hRule(ys[r + 1], xs[c], xs[c + 1]));
      }
    }
    const [table] = detectTables(BLOCK(), 0, {}, rules);
    expect(table.colEdges).toEqual(xs);
    expect(table.rowEdges).toEqual(ys);
    expect(table.pageRuled).toBe(true);
  });

  it("refuses a rule set that does not separate the columns", () => {
    // Four verticals, but bunched to one side: the right count, the wrong
    // places. Adopting them would put several columns in one cell. All sit
    // further than the snap tolerance from any derived edge, so none is taken.
    const rules = [
      vRule(45, 640, 730),
      vRule(55, 640, 730),
      vRule(65, 640, 730),
      vRule(460, 640, 730),
    ];
    const plain = detectTables(BLOCK(), 0)[0];
    const table = detectTables(BLOCK(), 0, {}, rules)[0];
    expect(table.colEdges).toEqual(plain.colEdges);
    expect(table.cols).toBe(3);
    expect(table.pageRuled).toBe(false);
  });

  it("gives each row its own extent when a column is one merged run", () => {
    // The whole column arrives as ONE paragraph run. Taking the run's box as
    // the row's extent collapsed every row onto the same top and bottom, and
    // the derived edges came out identical - a grid of zero-height rows.
    const runs = [
      column(["Team", "Engineering", "Design", "Support"], 60, 700, 18, 60),
      column(["2025", "22", "4", "7"], 200, 700, 18, 30),
      column(["2026", "31", "6", "9"], 320, 700, 18, 30),
    ];
    const [table] = detectTables(runs, 0);
    expect(table.rows).toBe(4);
    const gaps = table.rowEdges
      .slice(0, -1)
      .map((y, i) => y - table.rowEdges[i + 1]);
    for (const gap of gaps) expect(gap).toBeGreaterThan(1);
    expect(new Set(table.rowEdges).size).toBe(table.rowEdges.length);
  });

  it("ignores the rules of a second table further down the page", () => {
    // Another table below has rules just as wide as this one's. Spanning the
    // width is not enough - they must sit within this table to be its own.
    const rules = [
      hRule(716, 40, 420),
      hRule(696, 40, 420),
      hRule(676, 40, 420),
      hRule(656, 40, 420),
      hRule(500, 40, 420),
      hRule(480, 40, 420),
      hRule(460, 40, 420),
      hRule(440, 40, 420),
      vRule(50, 640, 730),
      vRule(150, 640, 730),
      vRule(300, 640, 730),
      vRule(400, 640, 730),
    ];
    const [table] = detectTables(BLOCK(), 0, {}, rules);
    expect(table.rowEdges).toEqual([716, 696, 676, 656]);
    expect(table.pageRuled).toBe(true);
  });

  it("detects a generously spaced table", () => {
    // Rows five times the type size apart - a form, a padded invoice, or the
    // text layer over a scan. Splitting on a fixed multiple of the type size
    // cut every one of these into single rows and found nothing.
    const runs = grid([60, 200, 320], 700, 44, [
      ["Region", "Q1", "Q2"],
      ["EMEA", "812", "905"],
      ["APAC", "398", "441"],
      ["LATAM", "88", "91"],
    ]);
    const [table] = detectTables(runs, 0);
    expect(table).toBeDefined();
    expect({ rows: table.rows, cols: table.cols }).toEqual({
      rows: 4,
      cols: 3,
    });
  });

  it("still splits where the gap breaks the table's own rhythm", () => {
    // Three tight rows, then a jump several times their spacing: two tables.
    const runs = [
      ...grid([60, 200, 320], 700, 18, [
        ["A", "1", "2"],
        ["B", "3", "4"],
        ["C", "5", "6"],
      ]),
      ...grid([60, 200, 320], 500, 18, [
        ["D", "7", "8"],
        ["E", "9", "10"],
      ]),
    ];
    expect(detectTables(runs, 0)).toHaveLength(2);
  });

  it("reads merged cells from the boundaries the page leaves undrawn", () => {
    // 4 columns. The boundary at x=150 is drawn only across row 1, and the one
    // at x=300 is missing from row 2 - so row 0 merges cols 0-1, and row 2
    // merges 0-1 and 2-3. This is the shape of a real banded, merged table.
    const rows = [
      { cands: [], cy: 706, top: 716, bottom: 696 },
      { cands: [], cy: 686, top: 696, bottom: 676 },
      { cands: [], cy: 666, top: 676, bottom: 656 },
    ];
    const lines = [
      { at: 50, from: 656, to: 716 },
      { at: 150, from: 676, to: 696 },
      { at: 300, from: 696, to: 716 },
      { at: 300, from: 676, to: 696 },
      { at: 400, from: 656, to: 716 },
    ];
    const pins = columnPins(lines, rows, 50, 400);
    expect(pins.map((p) => p.at)).toEqual([50, 150, 300, 400]);
    expect([...pins[1].rows]).toEqual([1]);

    expect(rowSpans(pins, 3, 0)).toEqual([
      { start: 0, span: 2 },
      { start: 2, span: 1 },
    ]);
    expect(rowSpans(pins, 3, 1)).toEqual([
      { start: 0, span: 1 },
      { start: 1, span: 1 },
      { start: 2, span: 1 },
    ]);
    expect(rowSpans(pins, 3, 2)).toEqual([{ start: 0, span: 3 }]);
  });

  it("keeps a boundary that only crosses part of the table", () => {
    // The old rule - at least half the table's height - threw this away, and
    // with it the whole merge structure.
    const rows = [
      { cands: [], cy: 706, top: 716, bottom: 696 },
      { cands: [], cy: 686, top: 696, bottom: 676 },
      { cands: [], cy: 666, top: 676, bottom: 656 },
      { cands: [], cy: 646, top: 656, bottom: 636 },
    ];
    const pins = columnPins([{ at: 150, from: 676, to: 696 }], rows, 50, 400);
    expect(pins).toHaveLength(1);
    expect([...pins[0].rows]).toEqual([1]);
  });

  it("ignores a rule that crosses no row band at all", () => {
    const rows = [{ cands: [], cy: 706, top: 716, bottom: 696 }];
    expect(
      columnPins([{ at: 150, from: 100, to: 130 }], rows, 50, 400),
    ).toEqual([]);
  });

  it("reads a cell merged downwards from a boundary that skips its column", () => {
    // Four columns, and the boundary below row 0 is drawn only across columns
    // 1-3: column 0's cell reaches down into row 1.
    const pins = rowPins(
      [
        { at: 716, from: 50, to: 400 },
        { at: 696, from: 150, to: 400 },
        { at: 676, from: 50, to: 400 },
      ],
      [50, 150, 250, 400],
      676,
      716,
    );
    expect(pins.map((p) => p.at)).toEqual([716, 696, 676]);
    expect([...pins[1].cols].sort()).toEqual([1, 2]);
    expect([...pins[0].cols].sort()).toEqual([0, 1, 2]);
  });

  it("groups row boundaries per table, not across the gap between them", () => {
    const pins = [
      { at: 716, cols: new Set([0]) },
      { at: 696, cols: new Set([0]) },
      { at: 676, cols: new Set([0]) },
      // A long way down the page: a second table, not a very tall row.
      { at: 400, cols: new Set([0]) },
      { at: 380, cols: new Set([0]) },
      { at: 360, cols: new Set([0]) },
    ];
    const groups = clusterRowPins(pins);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((p) => p.at)).toEqual([716, 696, 676]);
    expect(groups[1].map((p) => p.at)).toEqual([400, 380, 360]);
  });

  it("bands candidates onto the drawn rows, wherever their text sits", () => {
    // A vertically merged cell's text is centred over the rows it spans, so it
    // falls between them; the drawn boundaries still say which row owns it.
    const pins = [
      { at: 716, cols: new Set([0]) },
      { at: 696, cols: new Set([0]) },
      { at: 676, cols: new Set([0]) },
    ];
    const cands = [
      {
        run: run(60, 700, 30, "A"),
        left: 60,
        right: 90,
        cx: 75,
        cy: 706,
        height: 8,
      },
      {
        run: run(60, 680, 30, "B"),
        left: 60,
        right: 90,
        cx: 75,
        cy: 686,
        height: 8,
      },
    ];
    const banded = bandByRules(cands, pins);
    expect(banded).not.toBeNull();
    expect(banded).toHaveLength(2);
    expect(banded![0].cands).toHaveLength(1);
    expect(banded![1].cands).toHaveLength(1);
  });
});
