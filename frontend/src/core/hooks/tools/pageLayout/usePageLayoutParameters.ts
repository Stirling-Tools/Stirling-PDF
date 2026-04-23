import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface PageLayoutParameters extends BaseParameters {
  mode: "DEFAULT" | "CUSTOM";
  pagesPerSheet: number;
  rows: number;
  cols: number;
  orientation: "PORTRAIT" | "LANDSCAPE";
  arrangement: "BY_COLUMNS" | "BY_ROWS";
  readingDirection: "LTR" | "RTL";
  innerMargin?: number;
  topMargin?: number;
  bottomMargin?: number;
  leftMargin?: number;
  rightMargin?: number;
  addBorder: boolean;
  borderWidth?: number;
}

export const defaultParameters: PageLayoutParameters = {
  mode: "DEFAULT",
  pagesPerSheet: 4,
  rows: 1,
  cols: 1,
  orientation: "PORTRAIT",
  arrangement: "BY_COLUMNS",
  readingDirection: "LTR",
  addBorder: false,
  innerMargin: 0,
  topMargin: 0,
  bottomMargin: 0,
  leftMargin: 0,
  rightMargin: 0,
  borderWidth: 1,
};

export type PageLayoutParametersHook = BaseParametersHook<PageLayoutParameters>;

export const usePageLayoutParameters = (): PageLayoutParametersHook => {
  return useBaseParameters<PageLayoutParameters>({
    defaultParameters,
    endpointName: "multi-page-layout",
    validateFn: (params) => {
      const cols =
        params.mode === "DEFAULT"
          ? Math.ceil(Math.sqrt(params.pagesPerSheet))
          : params.cols;
      const rows =
        params.mode === "DEFAULT"
          ? Math.ceil(params.pagesPerSheet / cols)
          : params.rows;

      if (cols <= 0 || rows <= 0) return false;

      const pageWidth = params.orientation === "PORTRAIT" ? 595.28 : 841.89;
      const pageHeight = params.orientation === "PORTRAIT" ? 841.89 : 595.28;

      const left = params.leftMargin ?? 0;
      const right = params.rightMargin ?? 0;
      const top = params.topMargin ?? 0;
      const bottom = params.bottomMargin ?? 0;
      const inner = params.innerMargin ?? 0;

      // Reject impossible outer margins first.
      if (left + right >= pageWidth) return false;
      if (top + bottom >= pageHeight) return false;

      const cellWidth = (pageWidth - left - right) / cols;
      const cellHeight = (pageHeight - top - bottom) / rows;
      const innerWidth = cellWidth - 2 * inner;
      const innerHeight = cellHeight - 2 * inner;

      return innerWidth > 0 && innerHeight > 0;
    },
  });
};
