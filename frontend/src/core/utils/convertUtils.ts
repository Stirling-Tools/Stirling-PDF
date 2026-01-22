import {
  CONVERSION_ENDPOINTS,
  ENDPOINT_NAMES,
  EXTENSION_TO_ENDPOINT,
  CONVERSION_MATRIX,
  TO_FORMAT_OPTIONS
} from '@app/constants/convertConstants';

/**
 * Resolves the endpoint name for a given conversion
 */
export const getEndpointName = (fromExtension: string, toExtension: string): string => {
  if (!fromExtension || !toExtension) return '';

  let endpointKey = EXTENSION_TO_ENDPOINT[fromExtension]?.[toExtension];

  // If no explicit mapping exists and we're converting to PDF,
  // fall back to 'any' which uses file-to-pdf endpoint
  if (!endpointKey && toExtension === 'pdf' && fromExtension !== 'any') {
    endpointKey = EXTENSION_TO_ENDPOINT['any']?.[toExtension];
  }

  return endpointKey || '';
};

/**
 * Resolves the full endpoint URL for a given conversion
 */
export const getEndpointUrl = (fromExtension: string, toExtension: string): string => {
  const endpointName = getEndpointName(fromExtension, toExtension);
  if (!endpointName) return '';

  // Find the endpoint URL from CONVERSION_ENDPOINTS using the endpoint name
  for (const [key, endpoint] of Object.entries(CONVERSION_ENDPOINTS)) {
    if (ENDPOINT_NAMES[key as keyof typeof ENDPOINT_NAMES] === endpointName) {
      return endpoint;
    }
  }
  return '';
};

/**
 * Checks if a conversion is supported
 */
export const isConversionSupported = (fromExtension: string, toExtension: string): boolean => {
  return getEndpointName(fromExtension, toExtension) !== '';
};

/**
 * Checks if the given extension is an image format
 */
export const isImageFormat = (extension: string): boolean => {
  return ['png', 'jpg', 'jpeg', 'gif', 'tiff', 'bmp', 'webp'].includes(extension.toLowerCase());
};

export const isSvgFormat = (extension: string): boolean => {
  return extension.toLowerCase() === 'svg';
};

/**
 * Checks if the given extension is a web format
 */
export const isWebFormat = (extension: string): boolean => {
  return ['html', 'zip'].includes(extension.toLowerCase());
};

/**
 * Checks if the given extension is an office format (Word, Excel, PowerPoint, OpenOffice)
 * These formats use LibreOffice for conversion and require individual file processing
 */
export const isOfficeFormat = (extension: string): boolean => {
  return [
    'docx', 'doc', 'odt',  // Word processors
    'xlsx', 'xls', 'ods',  // Spreadsheets
    'pptx', 'ppt', 'odp'   // Presentations
  ].includes(extension.toLowerCase());
};

/**
 * Gets available target extensions for a given source extension
 * Extracted from useConvertParameters to be reusable in automation settings
 */
export const getAvailableToExtensions = (fromExtension: string): Array<{value: string, label: string, group: string}> => {
  if (!fromExtension) return [];

  // Handle dynamic format identifiers (file-<extension>)
  if (fromExtension.startsWith('file-')) {
    // Dynamic format - use 'any' conversion options (file-to-pdf)
    const supportedExtensions = CONVERSION_MATRIX['any'] || [];
    return TO_FORMAT_OPTIONS.filter(option =>
      supportedExtensions.includes(option.value)
    );
  }

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
