import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export enum PageSize {
  KEEP = "KEEP",
  A0 = "A0",
  A1 = "A1",
  A2 = "A2",
  A3 = "A3",
  A4 = "A4",
  A5 = "A5",
  A6 = "A6",
  LETTER = "LETTER",
  LEGAL = "LEGAL",
  A0_LANDSCAPE = "A0_LANDSCAPE",
  A1_LANDSCAPE = "A1_LANDSCAPE",
  A2_LANDSCAPE = "A2_LANDSCAPE",
  A3_LANDSCAPE = "A3_LANDSCAPE",
  A4_LANDSCAPE = "A4_LANDSCAPE",
  A5_LANDSCAPE = "A5_LANDSCAPE",
  A6_LANDSCAPE = "A6_LANDSCAPE",
  LETTER_LANDSCAPE = "LETTER_LANDSCAPE",
  LEGAL_LANDSCAPE = "LEGAL_LANDSCAPE",
}

export type Orientation = "PORTRAIT" | "LANDSCAPE";

const LANDSCAPE_SUFFIX = "_LANDSCAPE";

export const isLandscapePageSize = (size: PageSize): boolean =>
  size.endsWith(LANDSCAPE_SUFFIX);

export const getBasePageSize = (size: PageSize): PageSize =>
  isLandscapePageSize(size)
    ? (size.slice(0, -LANDSCAPE_SUFFIX.length) as PageSize)
    : size;

export const withOrientation = (
  size: PageSize,
  orientation: Orientation,
): PageSize => {
  if (size === PageSize.KEEP) return size;
  const base = getBasePageSize(size);
  return orientation === "LANDSCAPE"
    ? (`${base}${LANDSCAPE_SUFFIX}` as PageSize)
    : base;
};

export interface AdjustPageScaleParameters extends BaseParameters {
  scaleFactor: number;
  pageSize: PageSize;
}

export const defaultParameters: AdjustPageScaleParameters = {
  scaleFactor: 1.0,
  pageSize: PageSize.KEEP,
};

export type AdjustPageScaleParametersHook =
  BaseParametersHook<AdjustPageScaleParameters>;

export const useAdjustPageScaleParameters =
  (): AdjustPageScaleParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "scale-pages",
      validateFn: (params) => {
        return params.scaleFactor > 0;
      },
    });
  };
