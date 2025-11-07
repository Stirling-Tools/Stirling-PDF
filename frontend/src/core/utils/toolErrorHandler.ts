/**
 * Standardized error handling utilities for tool operations
 */

import axios from 'axios';

/**
 * Default error extractor that follows the standard pattern
 */
const DEFAULT_MESSAGE = 'There was an error processing your request.';

const resolveErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    if (typeof responseData === 'string') {
      return responseData;
    }
    if (responseData && typeof responseData === 'object' && 'message' in responseData) {
      const message = (responseData as { message?: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
    return error.message || fallbackMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallbackMessage;
};

export const extractErrorMessage = (error: unknown): string => resolveErrorMessage(error, DEFAULT_MESSAGE);

/**
 * Creates a standardized error handler for tool operations
 * @param fallbackMessage - Message to show when no specific error can be extracted
 * @returns Error handler function that follows the standard pattern
 */
export const createStandardErrorHandler = (fallbackMessage: string) => {
  return (error: unknown): string => resolveErrorMessage(error, fallbackMessage);
};
