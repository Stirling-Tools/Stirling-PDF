import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface RemovePagesParameters extends BaseParameters {
  pageNumbers: string; // comma-separated page numbers or ranges (e.g., "1,3,5-8")
}

export const defaultParameters: RemovePagesParameters = {
  pageNumbers: '',
};

export type RemovePagesParametersHook = BaseParametersHook<RemovePagesParameters>;

export const useRemovePagesParameters = (): RemovePagesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'remove-pages',
    validateFn: (p) => p.pageNumbers.trim().length > 0,
  });
};
