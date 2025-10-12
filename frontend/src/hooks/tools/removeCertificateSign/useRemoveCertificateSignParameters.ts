import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

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
    endpointName: 'remove-certificate-sign',
  });
};