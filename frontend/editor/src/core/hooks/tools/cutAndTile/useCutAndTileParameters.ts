import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";
import { parsePageSelection } from "@app/utils/parsePageSelection";

/** Cutting a page into pieces is a different job from splitting a document. */
export type CutAndTileMode = "grid" | "poster";

/** Which pages a grid cut applies to; mirrors the API's splitMode values. */
export type CutPagesScope =
  | "all"
  | "exceptFirst"
  | "exceptLast"
  | "exceptFirstAndLast"
  | "custom";

export interface CutAndTileParameters extends BaseParameters {
  mode: CutAndTileMode;
  /** Grid: how many pieces the page is cut into, counted as rows and columns. */
  rows: string;
  columns: string;
  cutPages: CutPagesScope;
  customPages: string;
  /** Grid: put the pieces back into one document instead of a zip of files. */
  assemble: boolean;
  /** Poster: paper each tile is scaled to, and the tile grid on the page. */
  pageSize: string;
  tileRows: string;
  tileColumns: string;
  rightToLeft: boolean;
}

export type CutAndTileParametersHook = BaseParametersHook<CutAndTileParameters>;

/**
 * The section endpoint divides the page width by horizontalDivisions + 1 and
 * the height by verticalDivisions + 1, so each axis carries its own limit.
 */
export const MAX_GRID_DIVISIONS = 100;
export const MAX_POSTER_DIVISIONS = 10;

/** Exactly the names PosterPdfController's size map accepts. */
export const PAPER_SIZES = [
  "A4",
  "Letter",
  "A3",
  "A5",
  "Legal",
  "Tabloid",
] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const defaultParameters: CutAndTileParameters = {
  mode: "grid",
  rows: "2",
  columns: "2",
  cutPages: "all",
  customPages: "",
  assemble: false,
  pageSize: "A4",
  tileRows: "2",
  tileColumns: "2",
  rightToLeft: false,
};

/** A whole number within `1..max`, or null when the text is anything else. */
export const readDivision = (value: string, max: number): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
};

export function gridDivisions(
  params: CutAndTileParameters,
): { rows: number; columns: number } | null {
  const rows = readDivision(params.rows, MAX_GRID_DIVISIONS);
  const columns = readDivision(params.columns, MAX_GRID_DIVISIONS);
  return rows && columns ? { rows, columns } : null;
}

export function posterDivisions(
  params: CutAndTileParameters,
): { rows: number; columns: number } | null {
  const rows = readDivision(params.tileRows, MAX_POSTER_DIVISIONS);
  const columns = readDivision(params.tileColumns, MAX_POSTER_DIVISIONS);
  return rows && columns ? { rows, columns } : null;
}

export const isPaperSize = (value: string): value is PaperSize =>
  (PAPER_SIZES as readonly string[]).includes(value);

/**
 * The single predicate behind both the Run button and the automation config.
 * Page bounds are only checkable with the document open; `totalPages` is null
 * for callers that have no metadata, which keeps the syntax check.
 */
export function validateCutAndTileParameters(
  params: CutAndTileParameters,
  totalPages: number | null = null,
): boolean {
  if (params.mode === "poster") {
    return (
      posterDivisions(params) !== null && isPaperSize(params.pageSize || "A4")
    );
  }

  if (gridDivisions(params) === null) return false;
  if (params.cutPages !== "custom") return true;

  const parsed = parsePageSelection(params.customPages, totalPages);
  return parsed.ok;
}

export const useCutAndTileParameters = (): CutAndTileParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) =>
      params.mode === "grid"
        ? "split-pdf-by-sections"
        : "split-for-poster-print",
    validateFn: validateCutAndTileParameters,
  });
};
