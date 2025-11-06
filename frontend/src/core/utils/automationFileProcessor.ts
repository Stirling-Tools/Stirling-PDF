/**
 * File processing utilities specifically for automation workflows
 */

import axios from 'axios';
import { zipFileService } from '@app/services/zipFileService';
import { ResourceManager } from '@app/utils/resourceManager';
import { AUTOMATION_CONSTANTS } from '@app/constants/automation';

export interface AutomationProcessingOptions {
  timeout?: number;
  responseType?: 'blob' | 'json';
}

export interface AutomationProcessingResult {
  success: boolean;
  files: File[];
  errors: string[];
}

export type AutomationFormParameters = Record<string, unknown>;

export class AutomationFileProcessor {
  /**
   * Check if a blob is a ZIP file by examining its header
   */
  static isZipFile(blob: Blob): boolean {
    // This is a simple check - in a real implementation you might want to read the first few bytes
    // For now, we'll rely on the extraction attempt and fallback
    return blob.type === 'application/zip' || blob.type === 'application/x-zip-compressed';
  }

  /**
   * Extract files from a ZIP blob during automation execution, with fallback for non-ZIP files
   * Extracts all file types (PDFs, images, etc.) except HTML files which stay zipped
   */
  static async extractAutomationZipFiles(blob: Blob): Promise<AutomationProcessingResult> {
    try {
      const zipFile = ResourceManager.createTimestampedFile(
        blob,
        AUTOMATION_CONSTANTS.RESPONSE_ZIP_PREFIX,
        '.zip',
        'application/zip'
      );

      // Check if ZIP contains HTML files - if so, keep as ZIP
      const containsHtml = await zipFileService.containsHtmlFiles(zipFile);
      if (containsHtml) {
        // HTML files should stay zipped - return ZIP as-is
        return {
          success: true,
          files: [zipFile],
          errors: []
        };
      }

      // Extract all files (not just PDFs) - handles images from scanner-image-split, etc.
      const result = await zipFileService.extractAllFiles(zipFile);

      if (!result.success || result.extractedFiles.length === 0) {
        // Fallback: keep as ZIP file (might be valid ZIP with extraction issues)
        return {
          success: true,
          files: [zipFile],
          errors: [`ZIP extraction failed, kept as ZIP: ${result.errors?.join(', ') || 'Unknown error'}`]
        };
      }

      return {
        success: true,
        files: result.extractedFiles,
        errors: []
      };
    } catch (error) {
      console.warn('Failed to extract automation ZIP files, keeping as ZIP:', error);
      // Fallback: keep as ZIP file for next automation step to handle
      const fallbackFile = ResourceManager.createTimestampedFile(
        blob,
        AUTOMATION_CONSTANTS.RESPONSE_ZIP_PREFIX,
        '.zip',
        'application/zip'
      );

      return {
        success: true,
        files: [fallbackFile],
        errors: [`ZIP extraction failed, kept as ZIP: ${error}`]
      };
    }
  }

  /**
   * Process a single file through an automation step
   */
  static async processAutomationSingleFile(
    endpoint: string,
    formData: FormData,
    originalFileName: string,
    options: AutomationProcessingOptions = {}
  ): Promise<AutomationProcessingResult> {
    try {
      const response = await axios.post(endpoint, formData, {
        responseType: options.responseType || 'blob',
        timeout: options.timeout || AUTOMATION_CONSTANTS.OPERATION_TIMEOUT
      });

      if (response.status !== 200) {
        return {
          success: false,
          files: [],
          errors: [`Automation step failed - HTTP ${response.status}: ${response.statusText}`]
        };
      }

      const resultFile = ResourceManager.createResultFile(
        response.data,
        originalFileName,
        AUTOMATION_CONSTANTS.FILE_PREFIX
      );

      return {
        success: true,
        files: [resultFile],
        errors: []
      };
    } catch (error: unknown) {
      return {
        success: false,
        files: [],
        errors: [`Automation step failed: ${AutomationFileProcessor.formatError(error)}`]
      };
    }
  }

  /**
   * Process multiple files through an automation step
   */
  static async processAutomationMultipleFiles(
    endpoint: string,
    formData: FormData,
    options: AutomationProcessingOptions = {}
  ): Promise<AutomationProcessingResult> {
    try {
      const response = await axios.post(endpoint, formData, {
        responseType: options.responseType || 'blob',
        timeout: options.timeout || AUTOMATION_CONSTANTS.OPERATION_TIMEOUT
      });

      if (response.status !== 200) {
        return {
          success: false,
          files: [],
          errors: [`Automation step failed - HTTP ${response.status}: ${response.statusText}`]
        };
      }

      // Multi-file responses are typically ZIP files
      return await this.extractAutomationZipFiles(response.data);
    } catch (error: unknown) {
      return {
        success: false,
        files: [],
        errors: [`Automation step failed: ${AutomationFileProcessor.formatError(error)}`]
      };
    }
  }

  /**
   * Build form data for automation tool operations
   */
  static buildAutomationFormData(
    parameters: AutomationFormParameters,
    files: File | File[],
    fileFieldName: string = 'fileInput'
  ): FormData {
    const formData = new FormData();

    // Add files
    if (Array.isArray(files)) {
      files.forEach(file => formData.append(fileFieldName, file));
    } else {
      formData.append(fileFieldName, files);
    }

    // Add parameters
    Object.entries(parameters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item !== undefined && item !== null) {
            formData.append(key, AutomationFileProcessor.normalizeFormValue(item));
          }
        });
      } else if (value !== undefined && value !== null) {
        formData.append(key, AutomationFileProcessor.normalizeFormValue(value));
      }
    });

    return formData;
  }

  private static normalizeFormValue(value: unknown): string | Blob {
    if (value instanceof Blob || value instanceof File) {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  private static formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      if (typeof responseData === 'string') return responseData;
      if (responseData && typeof responseData === 'object' && 'message' in responseData) {
        const message = (responseData as { message?: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
      }
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
