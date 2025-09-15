import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemoveBlanksParameters, defaultParameters } from './useRemoveBlanksParameters';
import { useToolResources } from '../shared/useToolResources';

export const buildRemoveBlanksFormData = (parameters: RemoveBlanksParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('threshold', String(parameters.threshold));
  formData.append('whitePercent', String(parameters.whitePercent));
  // Note: includeBlankPages is not sent to backend as it always returns both files in a ZIP
  return formData;
};

export const removeBlanksOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemoveBlanksFormData,
  operationType: 'remove-blanks',
  endpoint: '/api/v1/misc/remove-blanks',
  filePrefix: 'noblank_',
  defaultParameters,
} as const satisfies ToolOperationConfig<RemoveBlanksParameters>;

export const useRemoveBlanksOperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  const responseHandler = useCallback(async (blob: Blob, _originalFiles: File[]): Promise<File[]> => {
    // Backend always returns a ZIP file containing the processed PDFs
    const files = await extractZipFiles(blob);
    if (files.length > 0) return files;

    // Fallback error handling
    const textBuf = await blob.slice(0, 1024).arrayBuffer();
    const text = new TextDecoder().decode(new Uint8Array(textBuf));
    if (/error|exception|html/i.test(text)) {
      const title =
        text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
        text.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] ||
        'Unknown error';
      throw new Error(`Remove blanks service error: ${title}`);
    }
    throw new Error('Unexpected response format from remove blanks service');
  }, [extractZipFiles]);

  return useToolOperation<RemoveBlanksParameters>({
    ...removeBlanksOperationConfig,
    responseHandler,
    filePrefix: t('removeBlanks.filenamePrefix', 'noblank') + '_',
    getErrorMessage: createStandardErrorHandler(
      t('removeBlanks.error.failed', 'Failed to remove blank pages')
    )
  });
};


