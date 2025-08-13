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
  };
}

/**
 * Default error extractor that follows the standard pattern
 */
export const extractErrorMessage = (error: unknown): string => {
  const typedError = error as ToolError;
  if (typedError.response?.data && typeof typedError.response.data === 'string') {
    return typedError.response.data;
  }
  if (typedError.message) {
    return typedError.message;
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
    return extractErrorMessage(error) || fallbackMessage;
  };
};

/**
 * Creates error handler for tools that require specific Docker images or system dependencies.
 * Detects common "tool not available" patterns and provides user-friendly Docker upgrade messages.
 * 
 * @param toolName - Name of the tool (e.g., "OCR", "LibreOffice")
 * @param requiredImages - Docker images that support this tool (e.g., "standard or fat")
 * @param defaultMessage - Fallback error message
 * @param detectionPatterns - Additional patterns to detect tool unavailability
 * 
 * @example
 * // OCR tool
 * getErrorMessage: createDockerToolErrorHandler(
 *   'OCR',
 *   'standard or fat',
 *   t('ocr.error.failed', 'OCR operation failed'),
 *   ['OCRmyPDF', 'Tesseract']
 * )
 * 
 * // LibreOffice tool
 * getErrorMessage: createDockerToolErrorHandler(
 *   'LibreOffice', 
 *   'standard or fat',
 *   t('convert.error.failed', 'Conversion failed'),
 *   ['libreoffice', 'soffice']
 * )
 */
export const createDockerToolErrorHandler = (
  toolName: string,
  requiredImages: string,
  defaultMessage: string,
  detectionPatterns: string[] = []
) => (error: unknown): string => {
  const typedError = error as ToolError;
  const message = typedError?.message || '';
  
  // Common patterns for tool unavailability
  const commonPatterns = [
    'not installed',
    'not available',
    'command not found',
    'executable not found',
    'dependency not found'
  ];
  
  const allPatterns = [...commonPatterns, ...detectionPatterns];
  
  // Check if error indicates tool is not available
  const isToolUnavailable = allPatterns.some(pattern => 
    message.toLowerCase().includes(pattern.toLowerCase())
  ) && (
    message.toLowerCase().includes(toolName.toLowerCase()) ||
    detectionPatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()))
  );
  
  if (isToolUnavailable) {
    return `${toolName} tools are not installed on the server. Use the ${requiredImages} Docker image instead of ultra-lite, or install ${toolName} tools manually.`;
  }
  
  return createStandardErrorHandler(defaultMessage)(error);
};