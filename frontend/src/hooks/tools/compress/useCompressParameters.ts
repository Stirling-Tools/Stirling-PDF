import { useState } from 'react';
import { CompressParameters } from './useCompressOperation';

export interface CompressParametersHook {
  parameters: CompressParameters;
  updateParameter: (parameter: keyof CompressParameters, value: string | boolean | number) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

const initialParameters: CompressParameters = {
  compressionLevel: 2,
  grayscale: false,
  expectedSize: '',
  compressionMethod: 'quality',
  fileSizeValue: '',
  fileSizeUnit: 'MB',
};

export const useCompressParameters = (): CompressParametersHook => {
  const [parameters, setParameters] = useState<CompressParameters>(initialParameters);

  const updateParameter = (parameter: keyof CompressParameters, value: string | boolean | number) => {
    setParameters(prev => ({ ...prev, [parameter]: value }));
  };

  const resetParameters = () => {
    setParameters(initialParameters);
  };

  const validateParameters = () => {
    // For compression, we only need to validate that compression level is within range
    // and that at least one file is selected (at least, I think that's all we need to do here)
    return parameters.compressionLevel >= 1 && parameters.compressionLevel <= 9;
  };

  const getEndpointName = () => {
    return 'compress-pdf';
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
}; 