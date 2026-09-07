import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface ScannerImageSplitParameters extends BaseParameters {
  angle_threshold: number;
  tolerance: number;
  min_area: number;
  min_contour_area: number;
  border_size: number;
}

export const defaultParameters: ScannerImageSplitParameters = {
  angle_threshold: 10,
  tolerance: 30,
  min_area: 10000,
  min_contour_area: 500,
  border_size: 1,
};

export type ScannerImageSplitParametersHook =
  BaseParametersHook<ScannerImageSplitParameters>;

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateScannerImageSplitParameters(
  _params: ScannerImageSplitParameters,
): boolean {
  // All parameters are numeric with defaults, validation handled by form
  return true;
}

export const useScannerImageSplitParameters =
  (): ScannerImageSplitParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "extract-image-scans",
      validateFn: validateScannerImageSplitParameters,
    });
  };
