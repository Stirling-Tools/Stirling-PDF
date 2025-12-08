import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface ExtractPagesParameters extends BaseParameters {
  pageNumbers: string;
}

export const defaultParameters: ExtractPagesParameters = {
  pageNumbers: '',
};

export type ExtractPagesParametersHook = BaseParametersHook<ExtractPagesParameters>;

export const useExtractPagesParameters = (): ExtractPagesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'rearrange-pages',
    validateFn: (p) => (p.pageNumbers || '').trim().length > 0,
  });
};


