/**
 * Standardized error handling utilities for tool operations
 */

/**
 * Default error extractor that follows the standard pattern
 */
export const extractErrorMessage = (error: any): string => {
  if (error.response?.data && typeof error.response.data === 'string') {
    return error.response.data;
  }
  if (error.message) {
    return error.message;
  }
  return 'Operation failed';
};

/**
 * Creates a standardized error handler for tool operations
 * @param fallbackMessage - Message to show when no specific error can be extracted
 * @returns Error handler function that follows the standard pattern
 */
export const createStandardErrorHandler = (fallbackMessage: string) => {
  return (error: any): string => {
    if (error.response?.data && typeof error.response.data === 'string') {
      return error.response.data;
    }
    if (error.message) {
      return error.message;
    }
    return fallbackMessage;
  };
};