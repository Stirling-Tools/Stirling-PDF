import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType, ToolOperationConfig } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { AdjustPageScaleParameters, defaultParameters } from '@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters';
import { adjustPageScaleClientSide } from '@app/utils/pdfOperations/adjustPageScale';

export const buildAdjustPageScaleFormData = (parameters: AdjustPageScaleParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("scaleFactor", parameters.scaleFactor.toString());
  formData.append("pageSize", parameters.pageSize);
  return formData;
};

export const adjustPageScaleOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAdjustPageScaleFormData,
  operationType: 'scalePages',
  endpoint: '/api/v1/general/scale-pages',
  defaultParameters,
  frontendProcessing: {
    process: adjustPageScaleClientSide,
    shouldUseFrontend: (params: AdjustPageScaleParameters) => params.processingMode === 'frontend',
    statusMessage: 'Scaling pages in browser...'
  }
} as const satisfies ToolOperationConfig<AdjustPageScaleParameters>;

export const useAdjustPageScaleOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AdjustPageScaleParameters>({
    ...adjustPageScaleOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('adjustPageScale.error.failed', 'An error occurred while adjusting the page scale.'))
  });
};
