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
  CUSTOM = "CUSTOM",
}

export type Orientation = "PORTRAIT" | "LANDSCAPE";

export type CustomSizeUnit = "mm" | "cm" | "in";

export interface AdjustPageScaleParameters extends BaseParameters {
  scaleFactor: number;
  pageSize: PageSize;
  orientation: Orientation;
  customWidth: number;
  customHeight: number;
  customUnit: CustomSizeUnit;
}

export const defaultParameters: AdjustPageScaleParameters = {
  scaleFactor: 1.0,
  pageSize: PageSize.KEEP,
  orientation: "PORTRAIT",
  customWidth: 210,
  customHeight: 297,
  customUnit: "mm",
};

export type AdjustPageScaleParametersHook =
  BaseParametersHook<AdjustPageScaleParameters>;

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateAdjustPageScaleParameters(
  params: AdjustPageScaleParameters,
): boolean {
  if (params.pageSize === PageSize.CUSTOM) {
    return (
      params.scaleFactor > 0 &&
      params.customWidth > 0 &&
      params.customHeight > 0
    );
  }
  return params.scaleFactor > 0;
}

export const useAdjustPageScaleParameters =
  (): AdjustPageScaleParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "scale-pages",
      validateFn: validateAdjustPageScaleParameters,
    });
  };
