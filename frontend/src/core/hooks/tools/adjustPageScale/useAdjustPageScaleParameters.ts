import { BaseParameters, ToggleableProcessingParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export enum PageSize {
  KEEP = 'KEEP',
  A0 = 'A0',
  A1 = 'A1',
  A2 = 'A2',
  A3 = 'A3',
  A4 = 'A4',
  A5 = 'A5',
  A6 = 'A6',
  LETTER = 'LETTER',
  LEGAL = 'LEGAL'
}

export interface AdjustPageScaleParameters extends BaseParameters, ToggleableProcessingParameters {
  scaleFactor: number;
  pageSize: PageSize;
}

export const defaultParameters: AdjustPageScaleParameters = {
  scaleFactor: 1.0,
  pageSize: PageSize.KEEP,
  processingMode: 'backend',
};

export type AdjustPageScaleParametersHook = BaseParametersHook<AdjustPageScaleParameters>;

export const useAdjustPageScaleParameters = (): AdjustPageScaleParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) => (params.processingMode === 'frontend' ? '' : 'scale-pages'),
    validateFn: (params) => {
      return params.scaleFactor > 0;
    },
  });
};
