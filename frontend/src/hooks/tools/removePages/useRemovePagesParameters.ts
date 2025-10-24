import { BaseParameters, ToggleableProcessingParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';
import { validatePageNumbers } from '../../../utils/pageSelection';

export interface RemovePagesParameters extends BaseParameters, ToggleableProcessingParameters {
  pageNumbers: string; // comma-separated page numbers or ranges (e.g., "1,3,5-8")
}

export const defaultParameters: RemovePagesParameters = {
  pageNumbers: '',
  processingMode: 'backend',
};

export type RemovePagesParametersHook = BaseParametersHook<RemovePagesParameters>;

export const useRemovePagesParameters = (): RemovePagesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) => params.processingMode === 'frontend' ? '' : 'remove-pages',
    validateFn: (p) => validatePageNumbers(p.pageNumbers),
  });
};
