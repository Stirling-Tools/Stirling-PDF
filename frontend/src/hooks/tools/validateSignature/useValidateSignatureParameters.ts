import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface ValidateSignatureParameters {
  certFile: File | null;
}

export const defaultParameters: ValidateSignatureParameters = {
  certFile: null,
};

export type ValidateSignatureParametersHook = BaseParametersHook<ValidateSignatureParameters>;

export const useValidateSignatureParameters = (): ValidateSignatureParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'validate-signature',
  });
};
