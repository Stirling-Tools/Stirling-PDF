import { describe, expect, test } from "vitest";
import {
  cutAndTileFromApiParams,
  cutAndTileToApiParams,
} from "@app/hooks/tools/cutAndTile/useCutAndTileOperation";
import {
  defaultParameters,
  type CutAndTileParameters,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

const params = (
  overrides: Partial<CutAndTileParameters>,
): CutAndTileParameters => ({ ...defaultParameters, ...overrides });

/**
 * The section endpoint divides the page width by horizontalDivisions + 1, so
 * horizontal divisions are columns. An asymmetric grid is the only shape that
 * catches the transpose; 2 x 2 passes either way.
 */
describe("cutAndTileToApiParams", () => {
  test("grid rows map to vertical divisions and columns to horizontal", () => {
    const api = cutAndTileToApiParams(
      params({ mode: "grid", rows: "2", columns: "3" }),
    );
    expect(api).toMatchObject({
      horizontalDivisions: 2,
      verticalDivisions: 1,
    });
  });

  test("grid keeps the scope and custom pages", () => {
    const api = cutAndTileToApiParams(
      params({
        mode: "grid",
        cutPages: "custom",
        customPages: "2, 4-5",
        assemble: true,
      }),
    );
    expect(api).toMatchObject({
      splitMode: "CUSTOM",
      pageNumbers: "2, 4-5",
      merge: true,
    });
  });

  test("poster maps tile columns to xFactor and rows to yFactor", () => {
    expect(
      cutAndTileToApiParams(
        params({
          mode: "poster",
          tileColumns: "3",
          tileRows: "2",
          pageSize: "Letter",
          rightToLeft: true,
        }),
      ),
    ).toMatchObject({
      pageSize: "Letter",
      xFactor: 3,
      yFactor: 2,
      rightToLeft: true,
    });
  });
});

describe("cutAndTileFromApiParams", () => {
  test("grid divisions are read back as rows and columns", () => {
    const restored = cutAndTileFromApiParams({
      horizontalDivisions: 2,
      verticalDivisions: 1,
      merge: false,
      splitMode: "SPLIT_ALL",
    });
    expect(restored).toMatchObject({ mode: "grid", rows: "2", columns: "3" });
  });

  test("asymmetric grid survives a round trip", () => {
    const original = params({ mode: "grid", rows: "2", columns: "5" });
    const restored = cutAndTileFromApiParams(cutAndTileToApiParams(original));
    expect(restored).toMatchObject({ mode: "grid", rows: "2", columns: "5" });
  });

  test("poster is recognised without a page size", () => {
    expect(
      cutAndTileFromApiParams({
        xFactor: 2,
        yFactor: 3,
        rightToLeft: false,
      }),
    ).toMatchObject({
      mode: "poster",
      tileColumns: "2",
      tileRows: "3",
      pageSize: defaultParameters.pageSize,
    });
  });
});
