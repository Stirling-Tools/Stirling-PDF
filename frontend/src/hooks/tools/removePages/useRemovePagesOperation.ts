import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemovePagesParameters, defaultParameters } from './useRemovePagesParameters';
// import { useToolResources } from '../shared/useToolResources';

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
  // const { extractZipFiles } = useToolResources();

  const responseHandler = useCallback(async (blob: Blob, originalFiles: File[]): Promise<File[]> => {
    // Backend returns a PDF for remove-pages
    const base = originalFiles[0]?.name?.replace(/\.[^.]+$/, '') || 'document';
    return [new File([blob], `removed_pages_${base}.pdf`, { type: 'application/pdf' })];
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
