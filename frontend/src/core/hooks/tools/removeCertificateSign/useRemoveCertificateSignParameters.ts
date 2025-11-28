import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface RemoveCertificateSignParameters extends BaseParameters {
  // Extends BaseParameters - ready for future parameter additions if needed
}

export const defaultParameters: RemoveCertificateSignParameters = {
  // No parameters needed
};

export type RemoveCertificateSignParametersHook = BaseParametersHook<RemoveCertificateSignParameters>;

export const useRemoveCertificateSignParameters = (): RemoveCertificateSignParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'remove-cert-sign',
  });
};