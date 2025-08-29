import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SingleLargePageParameters, defaultParameters } from './useSingleLargePageParameters';

// Static function that can be used by both the hook and automation executor
export const buildSingleLargePageFormData = (parameters: SingleLargePageParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  return formData;
};

// Static configuration object
export const singleLargePageOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildSingleLargePageFormData,
  operationType: 'single-large-page',
  endpoint: '/api/v1/general/pdf-to-single-page',
  filePrefix: 'single_page_', // Will be overridden in hook with translation
  defaultParameters,
} as const;

export const useSingleLargePageOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SingleLargePageParameters>({
    ...singleLargePageOperationConfig,
    filePrefix: t('pdfToSinglePage.filenamePrefix', 'single_page') + '_',
    getErrorMessage: createStandardErrorHandler(t('pdfToSinglePage.error.failed', 'An error occurred while converting to single page.'))
  });
};
