import { ProcessingError } from '../types/processing';

export class ProcessingErrorHandler {
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 2000, 4000]; // Progressive backoff in ms

  /**
   * Create a ProcessingError from an unknown error
   */
  static createProcessingError(
    error: unknown, 
    retryCount: number = 0, 
    maxRetries: number = this.DEFAULT_MAX_RETRIES
  ): ProcessingError {
    const originalError = error instanceof Error ? error : new Error(String(error));
    const message = originalError.message;

    // Determine error type based on error message and properties
    const errorType = this.determineErrorType(originalError, message);
    
    // Determine if error is recoverable
    const recoverable = this.isRecoverable(errorType, retryCount, maxRetries);

    return {
      type: errorType,
      message: this.formatErrorMessage(errorType, message),
      recoverable,
      retryCount,
      maxRetries,
      originalError
    };
  }

  /**
   * Determine the type of error based on error characteristics
   */
  private static determineErrorType(error: Error, message: string): ProcessingError['type'] {
    const lowerMessage = message.toLowerCase();

    // Network-related errors
    if (lowerMessage.includes('network') || 
        lowerMessage.includes('fetch') ||
        lowerMessage.includes('connection')) {
      return 'network';
    }

    // Memory-related errors
    if (lowerMessage.includes('memory') ||
        lowerMessage.includes('quota') ||
        lowerMessage.includes('allocation') ||
        error.name === 'QuotaExceededError') {
      return 'memory';
    }

    // Timeout errors
    if (lowerMessage.includes('timeout') ||
        lowerMessage.includes('aborted') ||
        error.name === 'AbortError') {
      return 'timeout';
    }

    // Cancellation
    if (lowerMessage.includes('cancel') ||
        lowerMessage.includes('abort') ||
        error.name === 'AbortError') {
      return 'cancelled';
    }

    // PDF corruption/parsing errors
    if (lowerMessage.includes('pdf') ||
        lowerMessage.includes('parse') ||
        lowerMessage.includes('invalid') ||
        lowerMessage.includes('corrupt') ||
        lowerMessage.includes('malformed')) {
      return 'corruption';
    }

    // Default to parsing error
    return 'parsing';
  }

  /**
   * Determine if an error is recoverable based on type and retry count
   */
  private static isRecoverable(
    errorType: ProcessingError['type'], 
    retryCount: number, 
    maxRetries: number
  ): boolean {
    // Never recoverable
    if (errorType === 'cancelled' || errorType === 'corruption') {
      return false;
    }

    // Recoverable if we haven't exceeded retry count
    if (retryCount >= maxRetries) {
      return false;
    }

    // Memory errors are usually not recoverable
    if (errorType === 'memory') {
      return retryCount < 1; // Only one retry for memory errors
    }

    // Network and timeout errors are usually recoverable
    return errorType === 'network' || errorType === 'timeout' || errorType === 'parsing';
  }

  /**
   * Format error message for user display
   */
  private static formatErrorMessage(errorType: ProcessingError['type'], originalMessage: string): string {
    switch (errorType) {
      case 'network':
        return 'Network connection failed. Please check your internet connection and try again.';
      
      case 'memory':
        return 'Insufficient memory to process this file. Try closing other applications or processing a smaller file.';
      
      case 'timeout':
        return 'Processing timed out. This file may be too large or complex to process.';
      
      case 'cancelled':
        return 'Processing was cancelled by user.';
      
      case 'corruption':
        return 'This PDF file appears to be corrupted or encrypted. Please try a different file.';
      
      case 'parsing':
        return `Failed to process PDF: ${originalMessage}`;
      
      default:
        return `Processing failed: ${originalMessage}`;
    }
  }

  /**
   * Execute an operation with automatic retry logic
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    onError?: (error: ProcessingError) => void,
    maxRetries: number = this.DEFAULT_MAX_RETRIES
  ): Promise<T> {
    let lastError: ProcessingError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.createProcessingError(error, attempt, maxRetries);
        
        // Notify error handler
        if (onError) {
          onError(lastError);
        }

        // Don't retry if not recoverable
        if (!lastError.recoverable) {
          break;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Wait before retry with progressive backoff
        const delay = this.RETRY_DELAYS[Math.min(attempt, this.RETRY_DELAYS.length - 1)];
        await this.delay(delay);
        
        console.log(`Retrying operation (attempt ${attempt + 2}/${maxRetries + 1}) after ${delay}ms delay`);
      }
    }

    // All retries exhausted
    throw lastError || new Error('Operation failed after all retries');
  }

  /**
   * Create a timeout wrapper for operations
   */
  static withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = 'Operation timed out'
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Create an AbortController that times out after specified duration
   */
  static createTimeoutController(timeoutMs: number): AbortController {
    const controller = new AbortController();
    
    setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    return controller;
  }

  /**
   * Check if an error indicates the operation should be retried
   */
  static shouldRetry(error: ProcessingError): boolean {
    return error.recoverable && error.retryCount < error.maxRetries;
  }

  /**
   * Get user-friendly suggestions based on error type
   */
  static getErrorSuggestions(error: ProcessingError): string[] {
    switch (error.type) {
      case 'network':
        return [
          'Check your internet connection',
          'Try refreshing the page',
          'Try again in a few moments'
        ];
      
      case 'memory':
        return [
          'Close other browser tabs or applications',
          'Try processing a smaller file',
          'Restart your browser',
          'Use a device with more memory'
        ];
      
      case 'timeout':
        return [
          'Try processing a smaller file',
          'Break large files into smaller sections',
          'Check your internet connection speed'
        ];
      
      case 'corruption':
        return [
          'Verify the PDF file opens in other applications',
          'Try re-downloading the file',
          'Try a different PDF file',
          'Contact the file creator if it appears corrupted'
        ];
      
      case 'parsing':
        return [
          'Verify this is a valid PDF file',
          'Try a different PDF file',
          'Contact support if the problem persists'
        ];
      
      default:
        return [
          'Try refreshing the page',
          'Try again in a few moments',
          'Contact support if the problem persists'
        ];
    }
  }

  /**
   * Utility function for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}