import { useState, useEffect } from 'react';
import { 
  COLOR_TYPES, 
  OUTPUT_OPTIONS,
  FIT_OPTIONS,
  TO_FORMAT_OPTIONS,
  CONVERSION_MATRIX,
  type ColorType,
  type OutputOption,
  type FitOption
} from '../../../constants/convertConstants';
import { getEndpointName as getEndpointNameUtil, getEndpointUrl, isImageFormat } from '../../../utils/convertUtils';

export interface ConvertParameters {
  fromExtension: string;
  toExtension: string;
  imageOptions: {
    colorType: ColorType;
    dpi: number;
    singleOrMultiple: OutputOption;
    fitOption: FitOption;
    autoRotate: boolean;
    combineImages: boolean;
  };
  isSmartDetection: boolean;
  smartDetectionType: 'mixed' | 'images' | 'none';
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
  analyzeFileTypes: (files: Array<{name: string}>) => void;
}

const initialParameters: ConvertParameters = {
  fromExtension: '',
  toExtension: '',
  imageOptions: {
    colorType: COLOR_TYPES.COLOR,
    dpi: 300,
    singleOrMultiple: OUTPUT_OPTIONS.MULTIPLE,
    fitOption: FIT_OPTIONS.MAINTAIN_ASPECT,
    autoRotate: true,
    combineImages: true,
  },
  isSmartDetection: false,
  smartDetectionType: 'none',
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
    const { fromExtension, toExtension, isSmartDetection, smartDetectionType } = parameters;
    
    if (isSmartDetection) {
      if (smartDetectionType === 'mixed') {
        // Mixed file types -> PDF using file-to-pdf endpoint
        return 'file-to-pdf';
      } else if (smartDetectionType === 'images') {
        // All images -> PDF using img-to-pdf endpoint
        return 'img-to-pdf';
      }
    }
    
    return getEndpointNameUtil(fromExtension, toExtension);
  };

  const getEndpoint = () => {
    const { fromExtension, toExtension, isSmartDetection, smartDetectionType } = parameters;
    
    if (isSmartDetection) {
      if (smartDetectionType === 'mixed') {
        // Mixed file types -> PDF using file-to-pdf endpoint
        return '/api/v1/convert/file/pdf';
      } else if (smartDetectionType === 'images') {
        // All images -> PDF using img-to-pdf endpoint
        return '/api/v1/convert/img/pdf';
      }
    }
    
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

  const analyzeFileTypes = (files: Array<{name: string}>) => {
    if (files.length <= 1) {
      // Single file or no files - use regular detection with auto-target selection
      const fromExt = files.length === 1 ? detectFileExtension(files[0].name) : '';
      const availableTargets = fromExt ? CONVERSION_MATRIX[fromExt] || [] : [];
      const autoTarget = availableTargets.length === 1 ? availableTargets[0] : '';
      
      setParameters(prev => ({
        ...prev,
        isSmartDetection: false,
        smartDetectionType: 'none',
        fromExtension: fromExt,
        toExtension: autoTarget
      }));
      return;
    }

    // Multiple files - analyze file types
    const extensions = files.map(file => detectFileExtension(file.name));
    const uniqueExtensions = [...new Set(extensions)];

    if (uniqueExtensions.length === 1) {
      // All files are the same type - use regular detection with auto-target selection
      const fromExt = uniqueExtensions[0];
      const availableTargets = CONVERSION_MATRIX[fromExt] || [];
      const autoTarget = availableTargets.length === 1 ? availableTargets[0] : '';
      
      setParameters(prev => ({
        ...prev,
        isSmartDetection: false,
        smartDetectionType: 'none',
        fromExtension: fromExt,
        toExtension: autoTarget
      }));
    } else {
      // Mixed file types
      const allImages = uniqueExtensions.every(ext => isImageFormat(ext));
      
      if (allImages) {
        // All files are images - use image-to-pdf conversion
        setParameters(prev => ({
          ...prev,
          isSmartDetection: true,
          smartDetectionType: 'images',
          fromExtension: 'image',
          toExtension: 'pdf'
        }));
      } else {
        // Mixed non-image types - use file-to-pdf conversion  
        setParameters(prev => ({
          ...prev,
          isSmartDetection: true,
          smartDetectionType: 'mixed',
          fromExtension: 'any',
          toExtension: 'pdf'
        }));
      }
    }
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
    analyzeFileTypes,
  };
};