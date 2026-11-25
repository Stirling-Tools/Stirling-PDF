import { describe, expect, it } from "vitest";
import {
  tableCells,
  tableRowCells,
} from "@editor/tools/pdfTextEditor/util/tableRow";

const run = (x: number) => ({
  bounds: { x, y: 0, width: 1, height: 800 },
});

describe("a page drawn so finding rows would compare every pair of runs", () => {
  // Every run is page-tall and shares the one line, so each is a neighbour of
  // all the others.
  const crowded = Array.from({ length: 5000 }, (_, i) => run(i));

  it("reads every run as a table cell, keeping all of it as content", () => {
    expect(tableCells(crowded, null).size).toBe(crowded.length);
  });

  it("reads every run as in a row", () => {
    const cells = tableRowCells(crowded, null, {
      keyOf: (cell) => String(cell.bounds.x),
      cells: 3,
    });
    expect(cells.size).toBe(crowded.length);
  });
});
