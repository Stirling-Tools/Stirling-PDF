import { useState } from 'react';
import { OCRParameters } from '../../../components/tools/ocr/OCRSettings';

export interface OCRParametersHook {
  parameters: OCRParameters;
  updateParameter: (key: keyof OCRParameters, value: any) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
}

const defaultParameters: OCRParameters = {
  languages: ['eng'],
  ocrType: 'skip-text',
  ocrRenderType: 'sandwich',
  additionalOptions: [],
};

export const useOCRParameters = (): OCRParametersHook => {
  const [parameters, setParameters] = useState<OCRParameters>(defaultParameters);

  const updateParameter = (key: keyof OCRParameters, value: any) => {
    setParameters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const resetParameters = () => {
    setParameters(defaultParameters);
  };

  const validateParameters = () => {
    // At minimum, we need at least one language selected
    return parameters.languages.length > 0;
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
  };
}; 