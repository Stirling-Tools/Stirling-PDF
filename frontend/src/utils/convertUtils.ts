import { 
  CONVERSION_ENDPOINTS,
  ENDPOINT_NAMES,
  EXTENSION_TO_ENDPOINT
} from '../constants/convertConstants';

/**
 * Resolves the endpoint name for a given conversion
 */
export const getEndpointName = (fromExtension: string, toExtension: string): string => {
  if (!fromExtension || !toExtension) return '';
  
  const endpointKey = EXTENSION_TO_ENDPOINT[fromExtension]?.[toExtension];
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
  return ['png', 'jpg', 'jpeg', 'gif', 'tiff', 'bmp', 'webp', 'svg'].includes(extension.toLowerCase());
};