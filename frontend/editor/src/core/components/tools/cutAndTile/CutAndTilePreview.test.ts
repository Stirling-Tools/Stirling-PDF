import { describe, expect, test } from "vitest";
import {
  gridCells,
  posterCells,
} from "@app/components/tools/cutAndTile/CutAndTilePreview";

/**
 * The numbers on the schematic are a promise about the order of the files the
 * endpoint writes, so they are pinned against real endpoint output: a 2 x 3 cut
 * of a page whose corners are distinguishable produced top-left, bottom-left,
 * top-middle, bottom-middle, top-right, bottom-right.
 */
describe("gridCells", () => {
  test("numbers down each column, starting at the top left", () => {
    expect(
      gridCells(2, 3).map(({ column, row, number }) => [number, column, row]),
    ).toEqual([
      [1, 0, 0],
      [2, 0, 1],
      [3, 1, 0],
      [4, 1, 1],
      [5, 2, 0],
      [6, 2, 1],
    ]);
  });

  test("covers every cell exactly once", () => {
    const numbers = gridCells(4, 5)
      .map((cell) => cell.number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe("posterCells", () => {
  test("numbers left to right, top to bottom", () => {
    expect(
      posterCells(2, 3, false).map(({ column, row, number }) => [
        number,
        column,
        row,
      ]),
    ).toEqual([
      [1, 0, 0],
      [2, 1, 0],
      [3, 2, 0],
      [4, 0, 1],
      [5, 1, 1],
      [6, 2, 1],
    ]);
  });

  test("right-to-left moves the numbers, not the reading order", () => {
    expect(
      posterCells(1, 3, true).map(({ column, number }) => [number, column]),
    ).toEqual([
      [1, 2],
      [2, 1],
      [3, 0],
    ]);
  });
});
