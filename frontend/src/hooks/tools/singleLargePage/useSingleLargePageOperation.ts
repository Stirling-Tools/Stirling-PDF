import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SingleLargePageParameters, defaultParameters } from './useSingleLargePageParameters';
import { singleLargePageClientSide } from '../../../utils/pdfOperations/singleLargePage';

// Static function that can be used by both the hook and automation executor
export const buildSingleLargePageFormData = (_parameters: SingleLargePageParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  return formData;
};

// Static configuration object
export const singleLargePageOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildSingleLargePageFormData,
  operationType: 'pdfToSinglePage',
  endpoint: '/api/v1/general/pdf-to-single-page',
  defaultParameters,
  frontendProcessing: {
    process: singleLargePageClientSide,
    shouldUseFrontend: (params) => params.processingMode === 'frontend',
    statusMessage: 'Merging pages into a single page in browser...'
  }
} as const satisfies ToolOperationConfig<SingleLargePageParameters>;

export const useSingleLargePageOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SingleLargePageParameters>({
    ...singleLargePageOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('pdfToSinglePage.error.failed', 'An error occurred while converting to single page.'))
  });
};
