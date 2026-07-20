import {
  BaseParametersHook,
  useBaseParameters,
} from "@editor/hooks/tools/shared/useBaseParameters";
import type { CompareMode } from "@editor/types/compare";
import type { FileId } from "@editor/types/file";

export const DEFAULT_PIXEL_DPI = 150;
export const DEFAULT_PIXEL_THRESHOLD = 0.1;

export interface CompareParameters {
  baseFileId: FileId | null;
  comparisonFileId: FileId | null;
  mode: CompareMode;
  pixelDpi: number;
  pixelThreshold: number;
}

export const defaultParameters: CompareParameters = {
  baseFileId: null,
  comparisonFileId: null,
  mode: "text",
  pixelDpi: DEFAULT_PIXEL_DPI,
  pixelThreshold: DEFAULT_PIXEL_THRESHOLD,
};

export type CompareParametersHook = BaseParametersHook<CompareParameters>;

export const useCompareParameters = (): CompareParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "compare",
    validateFn: (params) =>
      Boolean(
        params.baseFileId &&
        params.comparisonFileId &&
        params.baseFileId !== params.comparisonFileId,
      ),
  });
};
