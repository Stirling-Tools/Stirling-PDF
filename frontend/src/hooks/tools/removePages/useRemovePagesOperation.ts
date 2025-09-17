import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemovePagesParameters, defaultParameters } from './useRemovePagesParameters';
// import { useToolResources } from '../shared/useToolResources';

export const buildRemovePagesFormData = (parameters: RemovePagesParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  const cleaned = parameters.pageNumbers.replace(/\s+/g, '');
  formData.append('pageNumbers', cleaned);
  return formData;
};

export const removePagesOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemovePagesFormData,
  operationType: 'remove-pages',
  endpoint: '/api/v1/general/remove-pages',
  defaultParameters,
} as const satisfies ToolOperationConfig<RemovePagesParameters>;

export const useRemovePagesOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemovePagesParameters>({
    ...removePagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('removePages.error.failed', 'Failed to remove pages')
    )
  });
};
