import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface RemoveBlanksParameters extends BaseParameters {
  threshold: number; // 0-255
  whitePercent: number; // 0.1-100
  includeBlankPages: boolean; // whether to include detected blank pages in output
}

export const defaultParameters: RemoveBlanksParameters = {
  threshold: 10,
  whitePercent: 99.9,
  includeBlankPages: false,
};

export type RemoveBlanksParametersHook = BaseParametersHook<RemoveBlanksParameters>;

export const useRemoveBlanksParameters = (): RemoveBlanksParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'remove-blanks',
    validateFn: (p) => p.threshold >= 0 && p.threshold <= 255 && p.whitePercent > 0 && p.whitePercent <= 100,
  });
};


