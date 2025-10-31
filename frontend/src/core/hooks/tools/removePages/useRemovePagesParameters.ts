import { BaseParameters, ToggleableProcessingParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';
import { validatePageNumbers } from '@app/utils/pageSelection';

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
