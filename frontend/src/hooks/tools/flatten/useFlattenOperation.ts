import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { FlattenParameters, defaultParameters } from './useFlattenParameters';
import { flattenPdfClientSide } from '../../../utils/pdfOperations/flatten';

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
  defaultParameters,
  frontendProcessing: {
    process: flattenPdfClientSide,
    shouldUseFrontend: (params: FlattenParameters) =>
      params.processingMode === 'frontend' && params.flattenOnlyForms,
    statusMessage: 'Flattening PDF forms in browser...'
  }
} as const satisfies ToolOperationConfig<FlattenParameters>;

export const useFlattenOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<FlattenParameters>({
    ...flattenOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('flatten.error.failed', 'An error occurred while flattening the PDF.'))
  });
};
