import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface GetPdfInfoParameters extends BaseParameters {
  // No parameters needed
}

export const defaultParameters: GetPdfInfoParameters = {};

export type GetPdfInfoParametersHook = BaseParametersHook<GetPdfInfoParameters>;

export const useGetPdfInfoParameters = (): GetPdfInfoParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'get-info-on-pdf',
  });
};


