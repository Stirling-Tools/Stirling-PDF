import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface SanitizeParameters extends BaseParameters {
  removeJavaScript: boolean;
  removeEmbeddedFiles: boolean;
  removeXMPMetadata: boolean;
  removeMetadata: boolean;
  removeLinks: boolean;
  removeFonts: boolean;
}

export const defaultParameters: SanitizeParameters = {
  removeJavaScript: true,
  removeEmbeddedFiles: true,
  removeXMPMetadata: false,
  removeMetadata: false,
  removeLinks: false,
  removeFonts: false,
};

export type SanitizeParametersHook = BaseParametersHook<SanitizeParameters>;

export const useSanitizeParameters = (): SanitizeParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'sanitize-pdf',
    validateFn: (params) => {
      return Object.values(params).some(value => value === true);
    },
  });
};
