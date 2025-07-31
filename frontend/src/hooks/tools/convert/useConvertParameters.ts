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
import { getEndpointName as getEndpointNameUtil, getEndpointUrl, isImageFormat, isWebFormat } from '../../../utils/convertUtils';
import { detectFileExtension as detectFileExtensionUtil } from '../../../utils/fileUtils';

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
  htmlOptions: {
    zoomLevel: number;
  };
  isSmartDetection: boolean;
  smartDetectionType: 'mixed' | 'images' | 'web' | 'none';
}

export interface ConvertParametersHook {
  parameters: ConvertParameters;
  updateParameter: (parameter: keyof ConvertParameters, value: any) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
  getEndpoint: () => string;
  getAvailableToExtensions: (fromExtension: string) => Array<{value: string, label: string, group: string}>;
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
  htmlOptions: {
    zoomLevel: 1.0,
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
      } else if (smartDetectionType === 'web') {
        // All web files -> PDF using html-to-pdf endpoint
        return 'html-to-pdf';
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
      } else if (smartDetectionType === 'web') {
        // All web files -> PDF using html-to-pdf endpoint
        return '/api/v1/convert/html/pdf';
      }
    }
    
    return getEndpointUrl(fromExtension, toExtension);
  };

  const getAvailableToExtensions = (fromExtension: string) => {
    if (!fromExtension) return [];
    
    let supportedExtensions = CONVERSION_MATRIX[fromExtension] || [];
    
    // If no explicit conversion exists, but file-to-pdf might be available, 
    // fall back to 'any' conversion (which converts unknown files to PDF via file-to-pdf)
    if (supportedExtensions.length === 0 && fromExtension !== 'any') {
      supportedExtensions = CONVERSION_MATRIX['any'] || [];
    }
    
    return TO_FORMAT_OPTIONS.filter(option => 
      supportedExtensions.includes(option.value)
    );
  };


  const analyzeFileTypes = (files: Array<{name: string}>) => {
    if (files.length === 0) {
      // No files - reset to empty state
      setParameters(prev => ({
        ...prev,
        isSmartDetection: false,
        smartDetectionType: 'none',
        fromExtension: '',
        toExtension: ''
      }));
      return;
    }
    
    if (files.length === 1) {
      // Single file - use regular detection with auto-target selection
      const detectedExt = detectFileExtensionUtil(files[0].name);
      let fromExt = detectedExt;
      let availableTargets = detectedExt ? CONVERSION_MATRIX[detectedExt] || [] : [];
      
      // If no explicit conversion exists for this file type, fall back to 'any' 
      // which will attempt file-to-pdf conversion if available
      if (availableTargets.length === 0) {
        fromExt = 'any';
        availableTargets = CONVERSION_MATRIX['any'] || [];
      }
      
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
    const extensions = files.map(file => detectFileExtensionUtil(file.name));
    const uniqueExtensions = [...new Set(extensions)];

    if (uniqueExtensions.length === 1) {
      // All files are the same type - use regular detection with auto-target selection
      const detectedExt = uniqueExtensions[0];
      let fromExt = detectedExt;
      let availableTargets = CONVERSION_MATRIX[detectedExt] || [];
      
      // If no explicit conversion exists for this file type, fall back to 'any'
      if (availableTargets.length === 0) {
        fromExt = 'any';
        availableTargets = CONVERSION_MATRIX['any'] || [];
      }
      
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
      const allWeb = uniqueExtensions.every(ext => isWebFormat(ext));
      
      if (allImages) {
        // All files are images - use image-to-pdf conversion
        setParameters(prev => ({
          ...prev,
          isSmartDetection: true,
          smartDetectionType: 'images',
          fromExtension: 'image',
          toExtension: 'pdf'
        }));
      } else if (allWeb) {
        // All files are web files - use html-to-pdf conversion
        setParameters(prev => ({
          ...prev,
          isSmartDetection: true,
          smartDetectionType: 'web',
          fromExtension: 'html',
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
    analyzeFileTypes,
  };
};