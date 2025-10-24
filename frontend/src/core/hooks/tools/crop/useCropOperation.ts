import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { CropParameters, defaultParameters } from '@app/hooks/tools/crop/useCropParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildCropFormData = (parameters: CropParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  const cropArea = parameters.cropArea;

  // Backend expects precise float values for PDF coordinates
  formData.append("x", cropArea.x.toString());
  formData.append("y", cropArea.y.toString());
  formData.append("width", cropArea.width.toString());
  formData.append("height", cropArea.height.toString());

  return formData;
};

// Static configuration object
export const cropOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildCropFormData,
  operationType: 'crop',
  endpoint: '/api/v1/general/crop',
  defaultParameters,
} as const;

export const useCropOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CropParameters>({
    ...cropOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('crop.error.failed', 'An error occurred while cropping the PDF.')
    )
  });
};
