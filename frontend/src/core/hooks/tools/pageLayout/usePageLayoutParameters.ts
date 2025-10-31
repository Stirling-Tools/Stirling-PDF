import { BaseParameters, ToggleableProcessingParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface PageLayoutParameters extends BaseParameters, ToggleableProcessingParameters {
  pagesPerSheet: number;
  addBorder: boolean;
}

export const defaultParameters: PageLayoutParameters = {
  pagesPerSheet: 4,
  addBorder: false,
  processingMode: 'backend',
};

export type PageLayoutParametersHook = BaseParametersHook<PageLayoutParameters>;

export const usePageLayoutParameters = (): PageLayoutParametersHook => {
  return useBaseParameters<PageLayoutParameters>({
    defaultParameters,
    endpointName: (params) => (params.processingMode === 'frontend' ? '' : 'multi-page-layout'),
  });
};


