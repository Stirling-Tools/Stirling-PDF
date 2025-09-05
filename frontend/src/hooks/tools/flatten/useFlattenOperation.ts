import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { FlattenParameters, defaultParameters } from './useFlattenParameters';

// Static function that can be used by both the hook and automation executor
export const buildFlattenFormData = (parameters: FlattenParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('flattenOnlyForms', parameters.flattenOnlyForms.toString());
  return formData;
};

// Static configuration object
export const flattenOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildFlattenFormData,
  operationType: 'flatten',
  endpoint: '/api/v1/misc/flatten',
  filePrefix: 'flattened_', // Will be overridden in hook with translation
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useFlattenOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<FlattenParameters>({
    ...flattenOperationConfig,
    filePrefix: t('flatten.filenamePrefix', 'flattened') + '_',
    getErrorMessage: createStandardErrorHandler(t('flatten.error.failed', 'An error occurred while flattening the PDF.'))
  });
};