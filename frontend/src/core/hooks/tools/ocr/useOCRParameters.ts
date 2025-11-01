import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface OCRParameters extends BaseParameters {
  languages: string[];
  ocrType: string;
  ocrRenderType: string;
  additionalOptions: string[];
}

export type OCRParametersHook = BaseParametersHook<OCRParameters>;

export const defaultParameters: OCRParameters = {
  languages: [],
  ocrType: 'skip-text',
  ocrRenderType: 'hocr',
  additionalOptions: [],
};

export const useOCRParameters = (): OCRParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'ocr-pdf',
    validateFn: (params) => {
      // At minimum, we need at least one language selected
      return params.languages.length > 0;
    },
  });
};
