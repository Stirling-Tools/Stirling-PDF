import { useState } from 'react';
import { 
  COLOR_TYPES, 
  OUTPUT_OPTIONS,
  TO_FORMAT_OPTIONS,
  CONVERSION_MATRIX,
  type ColorType,
  type OutputOption
} from '../../../constants/convertConstants';
import { getEndpointName as getEndpointNameUtil, getEndpointUrl } from '../../../utils/convertUtils';

export interface ConvertParameters {
  fromExtension: string;
  toExtension: string;
  pageNumbers: string;
  imageOptions: {
    colorType: ColorType;
    dpi: number;
    singleOrMultiple: OutputOption;
  };
}

export interface ConvertParametersHook {
  parameters: ConvertParameters;
  updateParameter: (parameter: keyof ConvertParameters, value: any) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
  getEndpoint: () => string;
  getAvailableToExtensions: (fromExtension: string) => Array<{value: string, label: string, group: string}>;
  detectFileExtension: (filename: string) => string;
}

const initialParameters: ConvertParameters = {
  fromExtension: '',
  toExtension: '',
  pageNumbers: 'all',
  imageOptions: {
    colorType: COLOR_TYPES.COLOR,
    dpi: 300,
    singleOrMultiple: OUTPUT_OPTIONS.MULTIPLE,
  },
};

export const useConvertParameters = (): ConvertParametersHook => {
  const [parameters, setParameters] = useState<ConvertParameters>(initialParameters);

  const updateParameter = (parameter: keyof ConvertParameters, value: any) => {
    setParameters(prev => ({ ...prev, [parameter]: value }));
  };

  const resetParameters = () => {
    setParameters(initialParameters);
  };

  const validateParameters = () => {
    const { fromExtension, toExtension } = parameters;
    
    if (!fromExtension || !toExtension) return false;
    
    // Check if conversion is supported
    const supportedToExtensions = CONVERSION_MATRIX[fromExtension];
    if (!supportedToExtensions || !supportedToExtensions.includes(toExtension)) {
      return false;
    }
    
    // Additional validation for image conversions
    if (['png', 'jpg'].includes(toExtension)) {
      return parameters.imageOptions.dpi >= 72 && parameters.imageOptions.dpi <= 600;
    }
    
    return true;
  };

  const getEndpointName = () => {
    const { fromExtension, toExtension } = parameters;
    return getEndpointNameUtil(fromExtension, toExtension);
  };

  const getEndpoint = () => {
    const { fromExtension, toExtension } = parameters;
    return getEndpointUrl(fromExtension, toExtension);
  };

  const getAvailableToExtensions = (fromExtension: string) => {
    if (!fromExtension) return [];
    
    const supportedExtensions = CONVERSION_MATRIX[fromExtension] || [];
    return TO_FORMAT_OPTIONS.filter(option => 
      supportedExtensions.includes(option.value)
    );
  };

  const detectFileExtension = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension || '';
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
    getEndpoint,
    getAvailableToExtensions,
    detectFileExtension,
  };
};