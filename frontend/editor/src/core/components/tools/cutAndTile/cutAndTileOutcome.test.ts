import { describe, expect, test } from "vitest";
import { computeCutAndTileOutcome } from "@app/components/tools/cutAndTile/cutAndTileOutcome";
import {
  defaultParameters,
  type CutAndTileParameters,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

const params = (
  overrides: Partial<CutAndTileParameters>,
): CutAndTileParameters => ({ ...defaultParameters, ...overrides });

describe("computeCutAndTileOutcome", () => {
  test("grid cuts every page into rows x columns pieces", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", rows: "2", columns: "3" }),
        4,
      ),
    ).toEqual({
      kind: "grid",
      piecesPerPage: 6,
      rows: 2,
      columns: 3,
      cutPages: 4,
      totalPages: 4,
      files: 24,
      assembled: false,
    });
  });

  test("pages outside the scope stay whole, one file each", () => {
    const outcome = computeCutAndTileOutcome(
      params({
        mode: "grid",
        rows: "2",
        columns: "2",
        cutPages: "exceptFirst",
      }),
      4,
    );
    expect(outcome).toMatchObject({
      kind: "grid",
      cutPages: 3,
      files: 3 * 4 + 1,
    });
  });

  test("assembling keeps a single file", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", rows: "2", columns: "2", assemble: true }),
        4,
      ),
    ).toMatchObject({ kind: "grid", files: 1, assembled: true });
  });

  test("custom pages must parse against the document", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", cutPages: "custom", customPages: "9" }),
        4,
      ),
    ).toEqual({ kind: "invalid", reason: "pages" });
  });

  test("poster tiles multiply pages by the tile grid", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "poster", tileRows: "2", tileColumns: "2" }),
        3,
      ),
    ).toEqual({
      kind: "poster",
      tilesPerPage: 4,
      rows: 2,
      columns: 2,
      totalPages: 3,
      files: 12,
      pageSize: "A4",
    });
  });

  test("zero rows are rejected rather than guessed at", () => {
    expect(
      computeCutAndTileOutcome(params({ mode: "grid", rows: "0" }), 4),
    ).toEqual({ kind: "invalid", reason: "values" });
  });
});
