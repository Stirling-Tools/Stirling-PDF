import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface FlattenParameters extends BaseParameters {
  flattenOnlyForms: boolean;
}

export const defaultParameters: FlattenParameters = {
  flattenOnlyForms: false,
};

export type FlattenParametersHook = BaseParametersHook<FlattenParameters>;

export const useFlattenParameters = (): FlattenParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'flatten',
    validateFn: () => true, // Always valid - no required parameters
  });
};