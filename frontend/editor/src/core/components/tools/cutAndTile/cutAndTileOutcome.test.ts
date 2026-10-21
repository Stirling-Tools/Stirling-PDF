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
      outputFiles: 24,
      outputPages: 24,
      assembled: false,
      largeJob: false,
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
      outputFiles: 3 * 4 + 1,
      outputPages: 3 * 4 + 1,
    });
  });

  test("assembling keeps one file but every page", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", rows: "2", columns: "2", assemble: true }),
        4,
      ),
    ).toMatchObject({
      kind: "grid",
      outputFiles: 1,
      outputPages: 16,
      assembled: true,
    });
  });

  test("custom pages must parse against the document", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", cutPages: "custom", customPages: "9" }),
        4,
      ),
    ).toEqual({ kind: "invalid", reason: "pages" });
  });

  test("custom pages are syntax-checked before the page count is known", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", cutPages: "custom", customPages: "9" }),
        null,
      ),
    ).toMatchObject({ kind: "unknown" });
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", cutPages: "custom", customPages: "second" }),
        null,
      ),
    ).toEqual({ kind: "invalid", reason: "pages" });
  });

  test("poster is one PDF holding every tile as a page", () => {
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
      outputFiles: 1,
      outputPages: 12,
      pageSize: "A4",
      largeJob: false,
    });
  });

  test("zero rows are rejected rather than guessed at", () => {
    expect(
      computeCutAndTileOutcome(params({ mode: "grid", rows: "0" }), 4),
    ).toEqual({ kind: "invalid", reason: "values" });
  });

  test("grid divisions past the endpoint limit are rejected", () => {
    expect(
      computeCutAndTileOutcome(params({ mode: "grid", rows: "101" }), 4),
    ).toEqual({ kind: "invalid", reason: "values" });
    expect(
      computeCutAndTileOutcome(params({ mode: "poster", tileRows: "11" }), 4),
    ).toEqual({ kind: "invalid", reason: "values" });
  });

  test("an unsupported paper size is rejected", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "poster", pageSize: "A2" }),
        2,
      ),
    ).toEqual({ kind: "invalid", reason: "size" });
  });

  test("a missing page count is its own state, not an empty document", () => {
    expect(
      computeCutAndTileOutcome(
        params({ mode: "grid", rows: "2", columns: "3" }),
        null,
      ),
    ).toEqual({
      kind: "unknown",
      mode: "grid",
      rows: 2,
      columns: 3,
      piecesPerPage: 6,
    });
  });

  test("a very large job is flagged before it runs", () => {
    const outcome = computeCutAndTileOutcome(
      params({ mode: "grid", rows: "100", columns: "100", assemble: true }),
      1,
    );
    expect(outcome).toMatchObject({
      kind: "grid",
      outputPages: 10000,
      largeJob: true,
    });
  });
});
