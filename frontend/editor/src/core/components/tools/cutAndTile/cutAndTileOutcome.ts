import { parsePageSelection } from "@app/utils/parsePageSelection";
import {
  gridDivisions,
  isPaperSize,
  posterDivisions,
  type CutAndTileParameters,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

/**
 * What a cut-and-tile configuration produces, computed from the page count so
 * the settings can promise a result before the run. Pure: no i18n, no React.
 *
 * `outputFiles` and `outputPages` are separate because the two modes disagree:
 * separate grid pieces are one page per file, while poster tiles and assembled
 * grids are many pages inside a single PDF.
 */
export type CutAndTileOutcome =
  | {
      kind: "unknown";
      mode: "grid" | "poster";
      rows: number;
      columns: number;
      piecesPerPage: number;
    }
  | { kind: "invalid"; reason: "pages" | "values" | "size" }
  | {
      kind: "grid";
      rows: number;
      columns: number;
      piecesPerPage: number;
      cutPages: number;
      totalPages: number;
      outputFiles: number;
      outputPages: number;
      assembled: boolean;
      largeJob: boolean;
    }
  | {
      kind: "poster";
      rows: number;
      columns: number;
      tilesPerPage: number;
      totalPages: number;
      outputFiles: 1;
      outputPages: number;
      pageSize: string;
      largeJob: boolean;
    };

/** Above this many output pages the run is worth warning about before it starts. */
export const LARGE_JOB_PAGES = 500;

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
  if (parameters.mode === "poster") {
    const divisions = posterDivisions(parameters);
    if (!divisions) return { kind: "invalid", reason: "values" };
    const pageSize = parameters.pageSize || "A4";
    if (!isPaperSize(pageSize)) return { kind: "invalid", reason: "size" };

    const tilesPerPage = divisions.rows * divisions.columns;
    if (!totalPages || totalPages <= 0) {
      return {
        kind: "unknown",
        mode: "poster",
        rows: divisions.rows,
        columns: divisions.columns,
        piecesPerPage: tilesPerPage,
      };
    }
    const outputPages = totalPages * tilesPerPage;
    return {
      kind: "poster",
      rows: divisions.rows,
      columns: divisions.columns,
      tilesPerPage,
      totalPages,
      outputFiles: 1,
      outputPages,
      pageSize,
      largeJob: outputPages > LARGE_JOB_PAGES,
    };
  }

  const divisions = gridDivisions(parameters);
  if (!divisions) return { kind: "invalid", reason: "values" };

  // A custom selection is checkable for syntax even before the count is known.
  if (parameters.cutPages === "custom") {
    const parsed = parsePageSelection(parameters.customPages, totalPages);
    if (!parsed.ok) return { kind: "invalid", reason: "pages" };
    if (totalPages === null) {
      return {
        kind: "unknown",
        mode: "grid",
        rows: divisions.rows,
        columns: divisions.columns,
        piecesPerPage: divisions.rows * divisions.columns,
      };
    }
    if (parsed.pages.length === 0) return { kind: "invalid", reason: "pages" };
  }

  if (!totalPages || totalPages <= 0) {
    return {
      kind: "unknown",
      mode: "grid",
      rows: divisions.rows,
      columns: divisions.columns,
      piecesPerPage: divisions.rows * divisions.columns,
    };
  }

  const scope = pagesInScope(parameters, totalPages);
  if (!scope) return { kind: "invalid", reason: "pages" };

  const piecesPerPage = divisions.rows * divisions.columns;
  const cutPages = scope.length;
  const outputPages =
    cutPages * piecesPerPage + (totalPages - cutPages);
  return {
    kind: "grid",
    rows: divisions.rows,
    columns: divisions.columns,
    piecesPerPage,
    cutPages,
    totalPages,
    outputFiles: parameters.assemble ? 1 : outputPages,
    outputPages,
    assembled: parameters.assemble,
    largeJob: outputPages > LARGE_JOB_PAGES,
  };
}
