import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export type RedactMode = 'automatic' | 'manual';

export interface RedactParameters {
  mode: RedactMode;

  // Automatic redaction parameters
  listOfText: string;
  useRegex: boolean;
  wholeWordSearch: boolean;
  redactColor: string;
  customPadding: number;
  convertPDFToImage: boolean;
}

export const defaultParameters: RedactParameters = {
  mode: 'automatic',
  listOfText: '',
  useRegex: false,
  wholeWordSearch: false,
  redactColor: '#000000',
  customPadding: 0.1,
  convertPDFToImage: true,
};

export const useRedactParameters = (): BaseParametersHook<RedactParameters> => {
  return useBaseParameters<RedactParameters>({
    defaultParameters,
    endpointName: (params) => {
      if (params.mode === 'automatic') {
        return '/api/v1/security/auto-redact';
      }
      // Manual redaction endpoint would go here when implemented
      throw new Error('Manual redaction not yet implemented');
    },
    validateFn: (params) => {
      if (params.mode === 'automatic') {
        return params.listOfText.trim().length > 0;
      }
      // Manual mode validation would go here when implemented
      return false;
    }
  });
};
