import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface ScannerImageSplitParameters extends BaseParameters {
  angle_threshold: number;
  tolerance: number;
  min_area: number;
  min_contour_area: number;
  border_size: number;
}

export const defaultParameters: ScannerImageSplitParameters = {
  angle_threshold: 10,
  tolerance: 20,
  min_area: 8000,
  min_contour_area: 500,
  border_size: 1,
};

export type ScannerImageSplitParametersHook = BaseParametersHook<ScannerImageSplitParameters>;

export const useScannerImageSplitParameters = (): ScannerImageSplitParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'extract-image-scans',
    validateFn: () => {
      // All parameters are numeric with defaults, validation handled by form
      return true;
    },
  });
};