import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { ExtractImagesParameters, defaultParameters } from './useExtractImagesParameters';
import JSZip from 'jszip';

// Static configuration that can be used by both the hook and automation executor
export const buildExtractImagesFormData = (parameters: ExtractImagesParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("format", parameters.format);
  formData.append("allowDuplicates", parameters.allowDuplicates.toString());
  return formData;
};

// Response handler for extract-images which returns a ZIP file
const extractImagesResponseHandler = async (responseData: Blob, _originalFiles: File[]): Promise<File[]> => {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(responseData);
  const extractedFiles: File[] = [];

  for (const [filename, file] of Object.entries(zipContent.files)) {
    if (!file.dir) {
      const blob = await file.async('blob');
      const extractedFile = new File([blob], filename, { type: blob.type });
      extractedFiles.push(extractedFile);
    }
  }

  return extractedFiles;
};

// Static configuration object
export const extractImagesOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildExtractImagesFormData,
  operationType: 'extractImages',
  endpoint: '/api/v1/misc/extract-images',
  defaultParameters,
  // Extract-images returns a ZIP file containing multiple image files
  responseHandler: extractImagesResponseHandler,
} as const;

export const useExtractImagesOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ExtractImagesParameters>({
    ...extractImagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('extractImages.error.failed', 'An error occurred while extracting images from the PDF.'))
  });
};