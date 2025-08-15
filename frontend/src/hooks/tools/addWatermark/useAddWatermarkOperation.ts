import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { AddWatermarkParameters } from './useAddWatermarkParameters';

const buildFormData = (parameters: AddWatermarkParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  if (parameters.watermarkType === 'text') {
    formData.append("watermarkText", parameters.watermarkText);
  } else if (parameters.watermarkImage) {
    formData.append("watermarkImage", parameters.watermarkImage);
  }

  formData.append("fontSize", parameters.fontSize.toString());
  formData.append("rotation", parameters.rotation.toString());
  formData.append("opacity", (parameters.opacity / 100).toString()); // Convert percentage to decimal
  formData.append("widthSpacer", parameters.widthSpacer.toString());
  formData.append("heightSpacer", parameters.heightSpacer.toString());
  formData.append("position", parameters.position);

  if (parameters.overrideX !== undefined) {
    formData.append("overrideX", parameters.overrideX.toString());
  }
  if (parameters.overrideY !== undefined) {
    formData.append("overrideY", parameters.overrideY.toString());
  }

  return formData;
};

export const useAddWatermarkOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddWatermarkParameters>({
    operationType: 'watermark',
    endpoint: '/api/v1/security/add-watermark',
    buildFormData,
    filePrefix: t('watermark.filenamePrefix', 'watermarked') + '_',
    multiFileEndpoint: false, // Individual API calls per file
    getErrorMessage: createStandardErrorHandler(t('watermark.error.failed', 'An error occurred while adding watermark to the PDF.'))
  });
};