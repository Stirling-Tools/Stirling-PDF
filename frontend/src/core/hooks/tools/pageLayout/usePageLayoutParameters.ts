import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface PageLayoutParameters extends BaseParameters {
  pagesPerSheet: number;
  addBorder: boolean;
}

export const defaultParameters: PageLayoutParameters = {
  pagesPerSheet: 4,
  addBorder: false,
};

export type PageLayoutParametersHook = BaseParametersHook<PageLayoutParameters>;

export const usePageLayoutParameters = (): PageLayoutParametersHook => {
  return useBaseParameters<PageLayoutParameters>({
    defaultParameters,
    endpointName: 'multi-page-layout',
  });
};


