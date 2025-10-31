import { BaseParameters, ToggleableProcessingParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface FlattenParameters extends BaseParameters, ToggleableProcessingParameters {
  flattenOnlyForms: boolean;
}

export const defaultParameters: FlattenParameters = {
  flattenOnlyForms: false,
  processingMode: 'backend',
};

export type FlattenParametersHook = BaseParametersHook<FlattenParameters>;

export const useFlattenParameters = (): FlattenParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) => (params.processingMode === 'frontend' ? '' : 'flatten'),
  });
};
