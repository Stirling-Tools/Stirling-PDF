import {
  COLOR_TYPES,
  OUTPUT_OPTIONS,
  FIT_OPTIONS,
  CONVERSION_MATRIX,
  type ColorType,
  type OutputOption,
  type FitOption
} from '@app/constants/convertConstants';
import { getEndpointName as getEndpointNameUtil, getEndpointUrl, isImageFormat, isWebFormat, getAvailableToExtensions as getAvailableToExtensionsUtil } from '@app/utils/convertUtils';
import { detectFileExtension as detectFileExtensionUtil } from '@app/utils/fileUtils';
import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';
import { useCallback, useMemo } from 'react';

export interface ConvertParameters extends BaseParameters {
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
  emailOptions: {
    includeAttachments: boolean;
    maxAttachmentSizeMB: number;
    downloadHtml: boolean;
    includeAllRecipients: boolean;
  };
  pdfaOptions: {
    outputFormat: string;
  };
  pdfxOptions: {
    outputFormat: string;
  };
  cbrOptions: {
    optimizeForEbook: boolean;
  };
  pdfToCbrOptions: {
    dpi: number;
  };
  cbzOptions: {
    optimizeForEbook: boolean;
  };
  cbzOutputOptions: {
    dpi: number;
  };
  ebookOptions?: {
    embedAllFonts: boolean;
    includeTableOfContents: boolean;
    includePageNumbers: boolean;
    optimizeForEbook: boolean;
  };
  epubOptions?: {
    detectChapters: boolean;
    targetDevice: string;
    outputFormat: string;
  };
  isSmartDetection: boolean;
  smartDetectionType: 'mixed' | 'images' | 'web' | 'none';
}

export interface ConvertParametersHook extends BaseParametersHook<ConvertParameters> {
  getEndpoint: () => string;
  getAvailableToExtensions: (fromExtension: string) => Array<{value: string, label: string, group: string}>;
  analyzeFileTypes: (files: Array<{name: string}>) => void;
}

export const defaultParameters: ConvertParameters = {
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
  emailOptions: {
    includeAttachments: true,
    maxAttachmentSizeMB: 10,
    downloadHtml: false,
    includeAllRecipients: false,
  },
  pdfaOptions: {
    outputFormat: 'pdfa-1',
  },
  pdfxOptions: {
    outputFormat: 'pdfx-3',
  },
  cbrOptions: {
    optimizeForEbook: false,
  },
  pdfToCbrOptions: {
    dpi: 150,
  },
  cbzOptions: {
    optimizeForEbook: false,
  },
  cbzOutputOptions: {
    dpi: 150,
  },
  ebookOptions: {
    embedAllFonts: false,
    includeTableOfContents: false,
    includePageNumbers: false,
    optimizeForEbook: false,
  },
  epubOptions: {
    detectChapters: true,
    targetDevice: 'TABLET_PHONE_IMAGES',
    outputFormat: 'EPUB',
  },
  isSmartDetection: false,
  smartDetectionType: 'none',
};

const validateParameters = (params: ConvertParameters): boolean => {
  const { fromExtension, toExtension } = params;

  if (!fromExtension || !toExtension) return false;

  // Handle dynamic format identifiers (file-<extension>)
  let supportedToExtensions: string[] = [];
  if (fromExtension.startsWith('file-')) {
    // Dynamic format - use 'any' conversion options
    supportedToExtensions = CONVERSION_MATRIX['any'] || [];
  } else {
    // Regular format - check conversion matrix
    supportedToExtensions = CONVERSION_MATRIX[fromExtension] || [];
  }

  if (!supportedToExtensions.includes(toExtension)) {
    return false;
  }

  return true;
};

const getEndpointName = (params: ConvertParameters): string => {
  const { fromExtension, toExtension, isSmartDetection, smartDetectionType } = params;

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

  // Handle dynamic format identifiers (file-<extension>)
  if (fromExtension.startsWith('file-')) {
    // Dynamic format - use file-to-pdf endpoint
    return 'file-to-pdf';
  }

  return getEndpointNameUtil(fromExtension, toExtension);
};

export const useConvertParameters = (): ConvertParametersHook => {
  const config = useMemo(() => ({
    defaultParameters,
    endpointName: getEndpointName,
    validateFn: validateParameters,
  }), []);

  const baseHook = useBaseParameters(config);

  const getEndpoint = () => {
    const { fromExtension, toExtension, isSmartDetection, smartDetectionType } = baseHook.parameters;

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

    // Handle dynamic format identifiers (file-<extension>)
    if (fromExtension.startsWith('file-')) {
      // Dynamic format - use file-to-pdf endpoint
      return '/api/v1/convert/file/pdf';
    }

    return getEndpointUrl(fromExtension, toExtension);
  };

  const getAvailableToExtensions = getAvailableToExtensionsUtil;


  const analyzeFileTypes = useCallback((files: Array<{name: string}>) => {
    if (files.length === 0) {
      // No files - only reset smart detection, keep user's format choices
      baseHook.setParameters(prev => {
        // Only update if something actually changed
        if (prev.isSmartDetection === false && prev.smartDetectionType === 'none') {
          return prev; // No change needed
        }

        return {
          ...prev,
          isSmartDetection: false,
          smartDetectionType: 'none'
          // Don't reset fromExtension and toExtension - let user keep their choices
        };
      });
      return;
    }

    if (files.length === 1) {
      // Single file - use regular detection with smart target selection
      const detectedExt = detectFileExtensionUtil(files[0].name);
      let fromExt = detectedExt;
      let availableTargets = detectedExt ? CONVERSION_MATRIX[detectedExt] || [] : [];

      // If no explicit conversion exists for this file type, create a dynamic format entry
      // and fall back to 'any' conversion logic for the actual endpoint
      if (availableTargets.length === 0 && detectedExt) {
        fromExt = `file-${detectedExt}`; // Create dynamic format identifier
        availableTargets = CONVERSION_MATRIX['any'] || [];
      } else if (availableTargets.length === 0) {
        // No extension detected - fall back to 'any'
        fromExt = 'any';
        availableTargets = CONVERSION_MATRIX['any'] || [];
      }

      baseHook.setParameters(prev => {
        // Check if current toExtension is still valid for the new fromExtension
        const currentToExt = prev.toExtension;
        const isCurrentToExtValid = availableTargets.includes(currentToExt);

        // Auto-select target only if:
        // 1. No current target is set, OR
        // 2. Current target is invalid for new source type, OR
        // 3. There's only one possible target (forced conversion)
        let newToExtension = currentToExt;
        if (!currentToExt || !isCurrentToExtValid) {
          newToExtension = availableTargets.length === 1 ? availableTargets[0] : '';
        }

        const newState = {
          ...prev,
          isSmartDetection: false,
          smartDetectionType: 'none' as const,
          fromExtension: fromExt,
          toExtension: newToExtension
        };

        // Only update if something actually changed
        if (
          prev.isSmartDetection === newState.isSmartDetection &&
          prev.smartDetectionType === newState.smartDetectionType &&
          prev.fromExtension === newState.fromExtension &&
          prev.toExtension === newState.toExtension
        ) {
          return prev; // Return the same object to prevent re-render
        }

        return newState;
      });
      return;
    }

    // Multiple files - analyze file types
    const extensions = files.map(file => detectFileExtensionUtil(file.name));
    const uniqueExtensions = [...new Set(extensions)];

    if (uniqueExtensions.length === 1) {
      // All files are the same type - use regular detection with smart target selection
      const detectedExt = uniqueExtensions[0];
      let fromExt = detectedExt;
      let availableTargets = CONVERSION_MATRIX[detectedExt] || [];

      // If no explicit conversion exists for this file type, fall back to 'any'
      if (availableTargets.length === 0) {
        fromExt = 'any';
        availableTargets = CONVERSION_MATRIX['any'] || [];
      }

      baseHook.setParameters(prev => {
        // Check if current toExtension is still valid for the new fromExtension
        const currentToExt = prev.toExtension;
        const isCurrentToExtValid = availableTargets.includes(currentToExt);

        // Auto-select target only if:
        // 1. No current target is set, OR
        // 2. Current target is invalid for new source type, OR
        // 3. There's only one possible target (forced conversion)
        let newToExtension = currentToExt;
        if (!currentToExt || !isCurrentToExtValid) {
          newToExtension = availableTargets.length === 1 ? availableTargets[0] : '';
        }

        const newState = {
          ...prev,
          isSmartDetection: false,
          smartDetectionType: 'none' as const,
          fromExtension: fromExt,
          toExtension: newToExtension
        };

        // Only update if something actually changed
        if (
          prev.isSmartDetection === newState.isSmartDetection &&
          prev.smartDetectionType === newState.smartDetectionType &&
          prev.fromExtension === newState.fromExtension &&
          prev.toExtension === newState.toExtension
        ) {
          return prev; // Return the same object to prevent re-render
        }

        return newState;
      });
    } else {
      // Mixed file types
      const allImages = uniqueExtensions.every(ext => isImageFormat(ext));
      const allWeb = uniqueExtensions.every(ext => isWebFormat(ext));

      if (allImages) {
        // All files are images - use image-to-pdf conversion
        baseHook.setParameters(prev => {
          // Only update if something actually changed
          if (prev.isSmartDetection === true &&
              prev.smartDetectionType === 'images' &&
              prev.fromExtension === 'image' &&
              prev.toExtension === 'pdf') {
            return prev; // No change needed
          }

          return {
            ...prev,
            isSmartDetection: true,
            smartDetectionType: 'images',
            fromExtension: 'image',
            toExtension: 'pdf'
          };
        });
      } else if (allWeb) {
        // All files are web files - use html-to-pdf conversion
        baseHook.setParameters(prev => {
          // Only update if something actually changed
          if (prev.isSmartDetection === true &&
              prev.smartDetectionType === 'web' &&
              prev.fromExtension === 'html' &&
              prev.toExtension === 'pdf') {
            return prev; // No change needed
          }

          return {
            ...prev,
            isSmartDetection: true,
            smartDetectionType: 'web',
            fromExtension: 'html',
            toExtension: 'pdf'
          };
        });
      } else {
        // Mixed non-image types - use file-to-pdf conversion
        baseHook.setParameters(prev => {
          // Only update if something actually changed
          if (prev.isSmartDetection === true &&
              prev.smartDetectionType === 'mixed' &&
              prev.fromExtension === 'any' &&
              prev.toExtension === 'pdf') {
            return prev; // No change needed
          }

          return {
            ...prev,
            isSmartDetection: true,
            smartDetectionType: 'mixed',
            fromExtension: 'any',
            toExtension: 'pdf'
          };
        });
      }
    }
  }, [baseHook.setParameters]);

  return {
    ...baseHook,
    getEndpoint,
    getAvailableToExtensions,
    analyzeFileTypes,
  };
};
