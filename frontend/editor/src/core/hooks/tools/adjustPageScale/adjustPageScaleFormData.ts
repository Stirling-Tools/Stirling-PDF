import {
  AdjustPageScaleParameters,
  PageSize,
} from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";

export const ADJUST_PAGE_SCALE_ENDPOINT =
  "/api/v1/general/scale-pages" satisfies ToolEndpoint;
type AdjustPageScaleApiParams =
  ToolApiParams[typeof ADJUST_PAGE_SCALE_ENDPOINT];

export const adjustPageScaleToApiParams = (
  parameters: AdjustPageScaleParameters,
): AdjustPageScaleApiParams => ({
  scaleFactor: parameters.scaleFactor,
  pageSize: parameters.pageSize,
  orientation: parameters.orientation,
  ...(parameters.pageSize === PageSize.CUSTOM && {
    customWidth: parameters.customWidth,
    customHeight: parameters.customHeight,
    customUnit: parameters.customUnit,
  }),
});

export const adjustPageScaleFromApiParams = (
  apiParams: AdjustPageScaleApiParams,
): Partial<AdjustPageScaleParameters> => ({
  scaleFactor: apiParams.scaleFactor,
  pageSize: apiParams.pageSize as PageSize,
  orientation: apiParams.orientation,
  customWidth: apiParams.customWidth,
  customHeight: apiParams.customHeight,
  customUnit: apiParams.customUnit,
});

export const buildAdjustPageScaleFormData = (
  parameters: AdjustPageScaleParameters,
  file: File,
): FormData =>
  objectToFormData(adjustPageScaleToApiParams(parameters), {
    fileInput: file,
  });
