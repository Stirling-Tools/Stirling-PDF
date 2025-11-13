import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';
import type { GetPdfInfoParameters } from '@app/hooks/tools/getPdfInfo/useGetPdfInfoOperation';

export const defaultParameters: GetPdfInfoParameters = {};

export type GetPdfInfoParametersHook = BaseParametersHook<GetPdfInfoParameters>;

export const useGetPdfInfoParameters = (): GetPdfInfoParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'get-info-on-pdf',
  });
};


