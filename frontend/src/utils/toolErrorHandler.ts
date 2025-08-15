/**
 * Standardized error handling utilities for tool operations
 */

/**
 * Standard error type that covers common error patterns
 */
export interface ToolError {
  message?: string;
  response?: {
    data?: string | unknown;
    status?: number;
  };
}

/**
 * Extract error message from JSON response data
 */
const extractFromJsonData = (data: unknown): string | null => {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // Common JSON error patterns
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return obj.message.trim();
    }
    if (typeof obj.error === 'string' && obj.error.trim()) {
      return obj.error.trim();
    }
    if (typeof obj.detail === 'string' && obj.detail.trim()) {
      return obj.detail.trim();
    }
  }
  return null;
};

/**
 * Default error extractor that follows the standard pattern
 */
export const extractErrorMessage = (error: ToolError): string => {

  // Try response.data first
  if (typedError.response?.data) {
    // Handle string response.data
    if (typeof typedError.response.data === 'string' && typedError.response.data.trim()) {
      return typedError.response.data.trim();
    }

    // Handle JSON response.data
    const jsonMessage = extractFromJsonData(typedError.response.data);
    if (jsonMessage) {
      return jsonMessage;
    }

    // Handle Blob or other non-string data gracefully
    if (typedError.response.data instanceof Blob) {
      return 'Server returned an error response';
    }
  }

  // Fallback to error.message
  if (typedError.message && typedError.message.trim()) {
    return typedError.message.trim();
  }

  // Add HTTP status context if available
  if (typedError.response?.status) {
    return `Server error (${typedError.response.status})`;
  }

  return 'Operation failed';
};

/**
 * Creates a standardized error handler for tool operations
 * @param fallbackMessage - Message to show when no specific error can be extracted
 * @returns Error handler function that follows the standard pattern
 */
export const createStandardErrorHandler = (fallbackMessage: string) => {
  return (error: unknown): string => {
    const message = extractErrorMessage(error);
    return message === 'Operation failed' ? fallbackMessage : message;
  };
};

