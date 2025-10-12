import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export type RedactMode = 'automatic' | 'manual';

export interface RedactParameters extends BaseParameters {
  mode: RedactMode;

  // Automatic redaction parameters
  wordsToRedact: string[];
  useRegex: boolean;
  wholeWordSearch: boolean;
  redactColor: string;
  customPadding: number;
  convertPDFToImage: boolean;
}

export const defaultParameters: RedactParameters = {
  mode: 'automatic',
  wordsToRedact: [],
  useRegex: false,
  wholeWordSearch: false,
  redactColor: '#000000',
  customPadding: 0.1,
  convertPDFToImage: true,
};

export type RedactParametersHook = BaseParametersHook<RedactParameters>;

export const useRedactParameters = (): RedactParametersHook => {
  return useBaseParameters({
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
        return params.wordsToRedact.length > 0 && params.wordsToRedact.some(word => word.trim().length > 0);
      }
      // Manual mode validation would go here when implemented
      return false;
    }
  });
};
