import { EmptyParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface SingleLargePageParameters extends EmptyParameters {
  // Extends EmptyParameters - ready for future parameter additions if needed
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