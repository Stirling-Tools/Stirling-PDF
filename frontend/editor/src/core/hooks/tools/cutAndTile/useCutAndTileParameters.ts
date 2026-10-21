import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

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

const positiveInt = (value: string): boolean => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  return Number(trimmed) > 0;
};

export function validateCutAndTileParameters(
  params: CutAndTileParameters,
): boolean {
  if (params.mode === "grid") {
    if (!positiveInt(params.rows) || !positiveInt(params.columns)) return false;
    if (params.cutPages === "custom") return params.customPages.trim() !== "";
    return true;
  }
  return positiveInt(params.tileRows) && positiveInt(params.tileColumns);
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
