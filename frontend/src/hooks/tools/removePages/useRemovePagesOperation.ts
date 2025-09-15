import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemovePagesParameters, defaultParameters } from './useRemovePagesParameters';

export const buildRemovePagesFormData = (parameters: RemovePagesParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('pageNumbers', parameters.pageNumbers);
  return formData;
};

export const removePagesOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemovePagesFormData,
  operationType: 'remove-pages',
  endpoint: '/api/v1/general/remove-pages',
  filePrefix: 'removed_pages_',
  defaultParameters,
} as const satisfies ToolOperationConfig<RemovePagesParameters>;

export const useRemovePagesOperation = () => {
  const { t } = useTranslation();

  const responseHandler = useCallback(async (blob: Blob, originalFiles: File[]): Promise<File[]> => {
    // Try to detect zip vs pdf
    const headBuf = await blob.slice(0, 4).arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(headBuf));

    // PDF response: return as single file
    if (head.startsWith('%PDF')) {
      const base = originalFiles[0]?.name?.replace(/\.[^.]+$/, '') || 'document';
      return [new File([blob], `removed_pages_${base}.pdf`, { type: 'application/pdf' })];
    }

    // ZIP: extract PDFs inside
    if (head.startsWith('PK')) {
      const { extractZipFiles } = await import('../shared/useToolResources');
      const files = await extractZipFiles(blob);
      if (files.length > 0) return files;
    }

    // Unknown blob type
    const textBuf = await blob.slice(0, 1024).arrayBuffer();
    const text = new TextDecoder().decode(new Uint8Array(textBuf));
    if (/error|exception|html/i.test(text)) {
      const title =
        text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
        text.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] ||
        'Unknown error';
      throw new Error(`Remove pages service error: ${title}`);
    }
    throw new Error('Unexpected response format from remove pages service');
  }, []);

  return useToolOperation<RemovePagesParameters>({
    ...removePagesOperationConfig,
    responseHandler,
    filePrefix: t('removePages.filenamePrefix', 'removed_pages') + '_',
    getErrorMessage: createStandardErrorHandler(
      t('removePages.error.failed', 'Failed to remove pages')
    )
  });
};
