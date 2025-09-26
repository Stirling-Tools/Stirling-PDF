/**
 * Standardized error handling utilities for tool operations
 */

interface ErrorWithResponseData {
  response?: {
    data?: unknown;
  };
}

interface ErrorWithMessage {
  message?: unknown;
}

const hasResponseData = (error: unknown): error is ErrorWithResponseData => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (!('response' in error)) {
    return false;
  }

  const response = (error as ErrorWithResponseData).response;
  return typeof response === 'object' && response !== null && 'data' in response;
};

const hasMessage = (error: unknown): error is { message: string } => {
  if (typeof error === 'string') {
    return true;
  }

  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }

  return typeof (error as ErrorWithMessage).message === 'string';
};

/**
 * Default error extractor that follows the standard pattern
 */
export const extractErrorMessage = (error: unknown): string => {
  if (hasResponseData(error) && typeof error.response?.data === 'string') {
    return error.response.data;
  }
  if (hasMessage(error)) {
    return typeof error === 'string' ? error : error.message;
  }
  return 'There was an error processing your request.';
};

/**
 * Creates a standardized error handler for tool operations
 * @param fallbackMessage - Message to show when no specific error can be extracted
 * @returns Error handler function that follows the standard pattern
 */
export const createStandardErrorHandler = (fallbackMessage: string) => {
  return (error: unknown): string => {
    if (hasResponseData(error) && typeof error.response?.data === 'string') {
      return error.response.data;
    }
    if (hasMessage(error)) {
      return typeof error === 'string' ? error : error.message;
    }
    return fallbackMessage;
  };
};
