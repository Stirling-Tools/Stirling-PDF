import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { ScannerImageSplitParameters, defaultParameters } from '@app/hooks/tools/scannerImageSplit/useScannerImageSplitParameters';
import { useToolResources } from '@app/hooks/tools/shared/useToolResources';

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

// Static configuration object
export const scannerImageSplitOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildScannerImageSplitFormData,
  operationType: 'scannerImageSplit',
  endpoint: '/api/v1/misc/extract-image-scans',
  defaultParameters,
} as const;

export const useScannerImageSplitOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // Custom response handler that extracts ZIP files containing images
  // Can't add to exported config because it requires access to the hook so must be part of the hook
  const responseHandler = useCallback(async (blob: Blob, originalFiles: File[]): Promise<File[]> => {
    try {
      // Scanner image split returns ZIP files with multiple images
      const extractedFiles = await extractZipFiles(blob);

      // If extraction succeeded and returned files, use them
      if (extractedFiles.length > 0) {
        return extractedFiles;
      }
    } catch (error) {
      console.warn('Failed to extract as ZIP, treating as single file:', error);
    }

    // Fallback: treat as single file (PNG image)
    const inputFileName = originalFiles[0]?.name || 'document';
    const baseFileName = inputFileName.replace(/\.[^.]+$/, '');
    const singleFile = new File([blob], `${baseFileName}.png`, { type: 'image/png' });
    return [singleFile];
  }, [extractZipFiles]);

  const config: ToolOperationConfig<ScannerImageSplitParameters> = {
    ...scannerImageSplitOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(t('scannerImageSplit.error.failed', 'An error occurred while extracting image scans.'))
  };

  return useToolOperation(config);
};