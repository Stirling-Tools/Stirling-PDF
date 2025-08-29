/**
 * File processing utilities specifically for automation workflows
 */

import axios, { AxiosResponse } from 'axios';
import { zipFileService } from '../services/zipFileService';
import { ResourceManager } from './resourceManager';
import { AUTOMATION_CONSTANTS } from '../constants/automation';

export interface AutomationProcessingOptions {
  timeout?: number;
  responseType?: 'blob' | 'json';
}

export interface AutomationProcessingResult {
  success: boolean;
  files: File[];
  errors: string[];
}

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
   */
  static async extractAutomationZipFiles(blob: Blob): Promise<AutomationProcessingResult> {
    try {
      const zipFile = ResourceManager.createTimestampedFile(
        blob,
        AUTOMATION_CONSTANTS.RESPONSE_ZIP_PREFIX,
        '.zip',
        'application/zip'
      );

      const result = await zipFileService.extractPdfFiles(zipFile);

      if (!result.success || result.extractedFiles.length === 0) {
        // Fallback: treat as single PDF file
        const fallbackFile = ResourceManager.createTimestampedFile(
          blob,
          AUTOMATION_CONSTANTS.RESULT_FILE_PREFIX,
          '.pdf'
        );

        return {
          success: true,
          files: [fallbackFile],
          errors: [`ZIP extraction failed, treated as single file: ${result.errors?.join(', ') || 'Unknown error'}`]
        };
      }

      return {
        success: true,
        files: result.extractedFiles,
        errors: []
      };
    } catch (error) {
      console.warn('Failed to extract automation ZIP files, falling back to single file:', error);
      // Fallback: treat as single PDF file
      const fallbackFile = ResourceManager.createTimestampedFile(
        blob,
        AUTOMATION_CONSTANTS.RESULT_FILE_PREFIX,
        '.pdf'
      );

      return {
        success: true,
        files: [fallbackFile],
        errors: [`ZIP extraction failed, treated as single file: ${error}`]
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
    } catch (error: any) {
      return {
        success: false,
        files: [],
        errors: [`Automation step failed: ${error.response?.data || error.message}`]
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
    } catch (error: any) {
      return {
        success: false,
        files: [],
        errors: [`Automation step failed: ${error.response?.data || error.message}`]
      };
    }
  }

  /**
   * Build form data for automation tool operations
   */
  static buildAutomationFormData(
    parameters: Record<string, any>,
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
        value.forEach(item => formData.append(key, item));
      } else if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    return formData;
  }
}
