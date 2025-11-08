import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { PageLayoutParameters, defaultParameters } from '@app/hooks/tools/pageLayout/usePageLayoutParameters';
import { pageLayoutClientSide } from '@app/utils/pdfOperations/pageLayout';

export const buildPageLayoutFormData = (parameters: PageLayoutParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('pagesPerSheet', String(parameters.pagesPerSheet));
  formData.append('addBorder', String(parameters.addBorder));
  return formData;
};

export const pageLayoutOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildPageLayoutFormData,
  operationType: 'pageLayout',
  endpoint: '/api/v1/general/multi-page-layout',
  defaultParameters,
  frontendProcessing: {
    process: pageLayoutClientSide,
    shouldUseFrontend: (params) => params.processingMode === 'frontend',
    statusMessage: 'Creating multi-page layout in browser...'
  }
} as const satisfies ToolOperationConfig<PageLayoutParameters>;

export const usePageLayoutOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<PageLayoutParameters>({
    ...pageLayoutOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('pageLayout.error.failed', 'An error occurred while creating the multi-page layout.')
    )
  });
};


