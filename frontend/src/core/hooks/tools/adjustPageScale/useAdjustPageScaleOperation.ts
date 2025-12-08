import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { AdjustPageScaleParameters, defaultParameters } from '@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters';

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
} as const;

export const useAdjustPageScaleOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AdjustPageScaleParameters>({
    ...adjustPageScaleOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('adjustPageScale.error.failed', 'An error occurred while adjusting the page scale.'))
  });
};
