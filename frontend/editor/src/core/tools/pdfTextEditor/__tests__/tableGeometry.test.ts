import { describe, it, expect } from "vitest";
import {
  insertColumnEdges,
  removeColumnEdges,
  insertRowEdges,
  removeRowEdges,
  uniformColumnEdges,
  uniformRowEdges,
  moveColumnEdge,
  moveRowEdge,
  resizeColumnTrack,
  resizeRowTrack,
  scaleColumnEdges,
  scaleRowEdges,
  MIN_TRACK,
} from "@app/tools/pdfTextEditor/util/tableGeometry";

describe("tableGeometry", () => {
  it("builds uniform column edges", () => {
    expect(uniformColumnEdges(100, 300, 3)).toEqual([100, 200, 300, 400]);
  });

  it("builds uniform row edges descending in y", () => {
    expect(uniformRowEdges(700, 90, 3)).toEqual([700, 670, 640, 610]);
  });

  it("inserts a column, widening the grid and shifting tracks right", () => {
    const edges = [100, 200, 300]; // 2 columns
    const r = insertColumnEdges(edges, 1, 50);
    expect(r.edges).toEqual([100, 200, 250, 350]); // 3 columns now
    expect(r.shift).toEqual({ fromIndex: 1, delta: 50 });
  });

  it("inserts a column at the far left", () => {
    const r = insertColumnEdges([100, 200, 300], 0, 40);
    expect(r.edges).toEqual([100, 140, 240, 340]);
    expect(r.shift).toEqual({ fromIndex: 0, delta: 40 });
  });

  it("removes a column and closes the gap", () => {
    const edges = [100, 200, 250, 350]; // 3 columns
    const r = removeColumnEdges(edges, 1); // drop the 50-wide middle column
    expect(r.edges).toEqual([100, 200, 300]);
    expect(r.shift).toEqual({ fromIndex: 2, delta: -50 });
  });

  it("insert then remove a column round-trips", () => {
    const start = [100, 200, 300];
    const inserted = insertColumnEdges(start, 1, 50);
    const removed = removeColumnEdges(inserted.edges, 1);
    expect(removed.edges).toEqual(start);
  });

  it("inserts a row, pushing lower rows down", () => {
    const edges = [700, 670, 640]; // 2 rows, 30 tall each
    const r = insertRowEdges(edges, 1, 30);
    expect(r.edges).toEqual([700, 670, 640, 610]);
    expect(r.shift).toEqual({ fromIndex: 1, delta: -30 });
  });

  it("removes a row and pulls lower rows up", () => {
    const edges = [700, 670, 640, 610]; // 3 rows
    const r = removeRowEdges(edges, 1);
    expect(r.edges).toEqual([700, 670, 640]);
    expect(r.shift).toEqual({ fromIndex: 2, delta: 30 });
  });

  it("insert then remove a row round-trips", () => {
    const start = [700, 670, 640];
    const inserted = insertRowEdges(start, 1, 30);
    const removed = removeRowEdges(inserted.edges, 1);
    expect(removed.edges).toEqual(start);
  });

  it("moves an internal column edge, resizing only its two neighbours", () => {
    expect(moveColumnEdge([100, 200, 300, 400], 2, 340)).toEqual([
      100, 200, 340, 400,
    ]);
  });

  it("clamps a column edge so neither neighbour drops below the minimum", () => {
    const edges = [100, 200, 300];
    expect(moveColumnEdge(edges, 1, 0)[1]).toBe(100 + MIN_TRACK);
    expect(moveColumnEdge(edges, 1, 9999)[1]).toBe(300 - MIN_TRACK);
  });

  it("refuses to move an outer column edge", () => {
    const edges = [100, 200, 300];
    expect(moveColumnEdge(edges, 0, 50)).toEqual(edges);
    expect(moveColumnEdge(edges, 2, 500)).toEqual(edges);
  });

  it("moves an internal row edge, honouring descending y", () => {
    expect(moveRowEdge([700, 670, 640, 610], 1, 690)).toEqual([
      700, 690, 640, 610,
    ]);
  });

  it("clamps a row edge between its neighbours", () => {
    const edges = [700, 670, 640];
    expect(moveRowEdge(edges, 1, 9999)[1]).toBe(700 - MIN_TRACK);
    expect(moveRowEdge(edges, 1, 0)[1]).toBe(640 + MIN_TRACK);
  });

  it("scales columns about the left edge, keeping each column's share", () => {
    // 100..400 (300 wide, split 1:2) doubled -> 100..700, still split 1:2.
    expect(scaleColumnEdges([100, 200, 400], 600)).toEqual([100, 300, 700]);
  });

  it("scales rows about the top edge, keeping each row's share", () => {
    expect(scaleRowEdges([700, 670, 610], 180)).toEqual([700, 640, 520]);
  });

  it("never scales a track below the minimum", () => {
    const cols = scaleColumnEdges([0, 10, 20], 1);
    expect(cols[cols.length - 1] - cols[0]).toBe(MIN_TRACK * 2);
    const rows = scaleRowEdges([100, 90, 80], 1);
    expect(rows[0] - rows[rows.length - 1]).toBe(MIN_TRACK * 2);
  });

  it("falls back to uniform tracks when the grid has no extent", () => {
    expect(scaleColumnEdges([50, 50, 50], 100)).toEqual([50, 100, 150]);
    expect(scaleRowEdges([50, 50, 50], 100)).toEqual([50, 0, -50]);
  });

  it("resizes one column and slides the rest along", () => {
    // 3 columns of 100. Widening the first must not steal from the second.
    const edges = [0, 100, 200, 300];
    expect(resizeColumnTrack(edges, 1, 140)).toEqual([0, 140, 240, 340]);
    // The last edge resizes the last column.
    expect(resizeColumnTrack(edges, 3, 350)).toEqual([0, 100, 200, 350]);
  });

  it("will not shrink a column past the minimum", () => {
    const edges = [0, 100, 200, 300];
    expect(resizeColumnTrack(edges, 1, -50)[1]).toBe(MIN_TRACK);
  });

  it("leaves the outer left edge alone", () => {
    const edges = [0, 100, 200];
    expect(resizeColumnTrack(edges, 0, 40)).toEqual(edges);
  });

  it("resizes one row and slides the rest down", () => {
    // Row edges descend; growing row 0 pushes everything below it down.
    const edges = [700, 680, 660, 640];
    expect(resizeRowTrack(edges, 1, 670)).toEqual([700, 670, 650, 630]);
    expect(resizeRowTrack(edges, 1, 9999)[1]).toBe(700 - MIN_TRACK);
  });
});
