import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface SingleLargePageParameters extends BaseParameters {
  // Extends BaseParameters - ready for future parameter additions if needed
}

export const defaultParameters: SingleLargePageParameters = {
  // No parameters needed
};

export type SingleLargePageParametersHook = BaseParametersHook<SingleLargePageParameters>;

export const useSingleLargePageParameters = (): SingleLargePageParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'pdf-to-single-page',
  });
};