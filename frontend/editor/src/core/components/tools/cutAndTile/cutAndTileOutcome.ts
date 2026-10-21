import { parsePageSelection } from "@app/utils/parsePageSelection";
import type { CutAndTileParameters } from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

/**
 * What a cut-and-tile configuration produces, computed from the page count so
 * the settings can promise a result before the run. Pure: no i18n, no React.
 */
export type CutAndTileOutcome =
  | { kind: "invalid"; reason: "pages" | "values" }
  | {
      kind: "grid";
      piecesPerPage: number;
      rows: number;
      columns: number;
      cutPages: number;
      totalPages: number;
      files: number;
      assembled: boolean;
    }
  | {
      kind: "poster";
      tilesPerPage: number;
      rows: number;
      columns: number;
      totalPages: number;
      files: number;
      pageSize: string;
    };

const positiveInt = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
};

function pagesInScope(
  parameters: CutAndTileParameters,
  totalPages: number,
): number[] | null {
  switch (parameters.cutPages) {
    case "all":
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    case "exceptFirst":
      return Array.from(
        { length: Math.max(totalPages - 1, 0) },
        (_, i) => i + 2,
      );
    case "exceptLast":
      return Array.from(
        { length: Math.max(totalPages - 1, 0) },
        (_, i) => i + 1,
      );
    case "exceptFirstAndLast":
      return Array.from(
        { length: Math.max(totalPages - 2, 0) },
        (_, i) => i + 2,
      );
    case "custom": {
      if (!parameters.customPages.trim()) return null;
      const parsed = parsePageSelection(parameters.customPages, totalPages);
      return parsed.ok ? parsed.pages : null;
    }
    default:
      return null;
  }
}

export function computeCutAndTileOutcome(
  parameters: CutAndTileParameters,
  totalPages: number | null,
): CutAndTileOutcome {
  const pages = totalPages && totalPages > 0 ? totalPages : 0;

  if (parameters.mode === "grid") {
    const rows = positiveInt(parameters.rows);
    const columns = positiveInt(parameters.columns);
    if (!rows || !columns) return { kind: "invalid", reason: "values" };
    const piecesPerPage = rows * columns;
    const scope = pages ? pagesInScope(parameters, pages) : [];
    if (!scope) return { kind: "invalid", reason: "pages" };
    const cutPages = scope.length;
    const files = parameters.assemble
      ? 1
      : cutPages * piecesPerPage + (pages - cutPages);
    return {
      kind: "grid",
      piecesPerPage,
      rows,
      columns,
      cutPages,
      totalPages: pages,
      files,
      assembled: parameters.assemble,
    };
  }

  const rows = positiveInt(parameters.tileRows);
  const columns = positiveInt(parameters.tileColumns);
  if (!rows || !columns) return { kind: "invalid", reason: "values" };
  const tilesPerPage = rows * columns;
  return {
    kind: "poster",
    tilesPerPage,
    rows,
    columns,
    totalPages: pages,
    files: pages * tilesPerPage,
    pageSize: parameters.pageSize || "A4",
  };
}
