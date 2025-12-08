/**
 * Standardized error handling utilities for tool operations
 */

import { normalizeAxiosErrorData } from '@app/services/errorUtils';

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
  return 'There was an error processing your request.';
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

/**
 * Handles password-related errors with status code checking
 * @param error - The error object from axios
 * @param incorrectPasswordMessage - Message to show for incorrect password (typically 500 status)
 * @param fallbackMessage - Message to show for other errors
 * @returns Error message string
 */
export const handlePasswordError = async (
  error: any,
  incorrectPasswordMessage: string,
  fallbackMessage: string
): Promise<string> => {
  const status = error?.response?.status;

  // Handle specific error cases with user-friendly messages
  if (status === 500) {
    // 500 typically means incorrect password for encrypted PDFs
    return incorrectPasswordMessage;
  }

  // For other errors, try to extract the message
  const normalizedData = await normalizeAxiosErrorData(error?.response?.data);
  const errorWithNormalizedData = {
    ...error,
    response: {
      ...error?.response,
      data: normalizedData
    }
  };
  return extractErrorMessage(errorWithNormalizedData) || fallbackMessage;
};