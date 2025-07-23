import { useState } from 'react';
import { 
  FROM_FORMATS, 
  TO_FORMATS, 
  COLOR_TYPES, 
  OUTPUT_OPTIONS,
  OFFICE_FORMATS,
  CONVERSION_ENDPOINTS,
  ENDPOINT_NAMES,
  SUPPORTED_CONVERSIONS,
  FILE_EXTENSIONS,
  FROM_FORMAT_OPTIONS,
  TO_FORMAT_OPTIONS,
  CONVERSION_MATRIX,
  EXTENSION_TO_ENDPOINT,
  type FromFormat, 
  type ToFormat,
  type ColorType,
  type OutputOption,
  type OfficeFormat
} from '../../../constants/convertConstants';

export interface ConvertParameters {
  fromExtension: string;
  toExtension: string;
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
    if (!fromExtension || !toExtension) return '';
    
    const endpointKey = EXTENSION_TO_ENDPOINT[fromExtension]?.[toExtension];
    return endpointKey || '';
  };

  const getEndpoint = () => {
    const endpointName = getEndpointName();
    if (!endpointName) return '';
    
    // Find the endpoint URL from CONVERSION_ENDPOINTS using the endpoint name
    for (const [key, endpoint] of Object.entries(CONVERSION_ENDPOINTS)) {
      if (ENDPOINT_NAMES[key as keyof typeof ENDPOINT_NAMES] === endpointName) {
        return endpoint;
      }
    }
    return '';
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