import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { CropParameters, defaultParameters } from './useCropParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildCropFormData = (parameters: CropParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  // Backend expects precise float values for PDF coordinates
  formData.append("x", parameters.x.toString());
  formData.append("y", parameters.y.toString());
  formData.append("width", parameters.width.toString());
  formData.append("height", parameters.height.toString());

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
