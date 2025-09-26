import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { ScannerImageSplitParameters, defaultParameters } from './useScannerImageSplitParameters';
import { zipFileService } from '../../../services/zipFileService';

export const buildScannerImageSplitFormData = (parameters: ScannerImageSplitParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('angle_threshold', parameters.angle_threshold.toString());
  formData.append('tolerance', parameters.tolerance.toString());
  formData.append('min_area', parameters.min_area.toString());
  formData.append('min_contour_area', parameters.min_contour_area.toString());
  formData.append('border_size', parameters.border_size.toString());
  return formData;
};

// Custom response handler to handle ZIP files that might be misidentified
const scannerImageSplitResponseHandler = async (responseData: Blob, inputFiles: File[]): Promise<File[]> => {
  try {
    // Always try to extract as ZIP first, regardless of content-type
    const extractionResult = await zipFileService.extractAllFiles(responseData);
    if (extractionResult.success && extractionResult.extractedFiles.length > 0) {
      return extractionResult.extractedFiles;
    }
  } catch (error) {
    console.warn('Failed to extract as ZIP, treating as single file:', error);
  }

  // Fallback: treat as single file (PNG image)
  const inputFileName = inputFiles[0]?.name || 'document';
  const baseFileName = inputFileName.replace(/\.[^.]+$/, '');
  const singleFile = new File([responseData], `${baseFileName}.png`, { type: 'image/png' });
  return [singleFile];
};

export const scannerImageSplitOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildScannerImageSplitFormData,
  operationType: 'scannerImageSplit',
  endpoint: '/api/v1/misc/extract-image-scans',
  multiFileEndpoint: false,
  responseHandler: scannerImageSplitResponseHandler,
  defaultParameters,
} as const;

export const useScannerImageSplitOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ScannerImageSplitParameters>({
    ...scannerImageSplitOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('scannerImageSplit.error.failed', 'An error occurred while extracting image scans.'))
  });
};