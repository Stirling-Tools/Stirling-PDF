import { BaseParameters, ToggleableProcessingParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface SingleLargePageParameters extends BaseParameters, ToggleableProcessingParameters {
  // Extends BaseParameters - ready for future parameter additions if needed
}

export const defaultParameters: SingleLargePageParameters = {
  // No parameters needed
  processingMode: 'backend',
};

export type SingleLargePageParametersHook = BaseParametersHook<SingleLargePageParameters>;

export const useSingleLargePageParameters = (): SingleLargePageParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) => (params.processingMode === 'frontend' ? '' : 'pdf-to-single-page'),
  });
};