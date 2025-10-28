import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { ExtractImagesParameters, defaultParameters } from '@app/hooks/tools/extractImages/useExtractImagesParameters';
import { useToolResources } from '@app/hooks/tools/shared/useToolResources';

// Static configuration that can be used by both the hook and automation executor
export const buildExtractImagesFormData = (parameters: ExtractImagesParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("format", parameters.format);
  formData.append("allowDuplicates", parameters.allowDuplicates.toString());
  return formData;
};

// Static configuration object (without response handler - will be added in hook)
export const extractImagesOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildExtractImagesFormData,
  operationType: 'extractImages',
  endpoint: '/api/v1/misc/extract-images',
  defaultParameters,
} as const;

export const useExtractImagesOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // Response handler that respects auto-unzip preferences
  const responseHandler = useCallback(async (blob: Blob, _originalFiles: File[]): Promise<File[]> => {
    // Extract images returns a ZIP file - use preference-aware extraction
    return await extractZipFiles(blob);
  }, [extractZipFiles]);

  return useToolOperation<ExtractImagesParameters>({
    ...extractImagesOperationConfig,
    responseHandler,
    getErrorMessage: createStandardErrorHandler(t('extractImages.error.failed', 'An error occurred while extracting images from the PDF.'))
  });
};