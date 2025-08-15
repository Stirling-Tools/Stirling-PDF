import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { AddWatermarkParameters } from './useAddWatermarkParameters';

const buildFormData = (parameters: AddWatermarkParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  // Required: watermarkType as string
  formData.append("watermarkType", parameters.watermarkType || "text");

  // Add watermark content based on type
  if (parameters.watermarkType === 'text') {
    formData.append("watermarkText", parameters.watermarkText);
  } else if (parameters.watermarkType === 'image' && parameters.watermarkImage) {
    formData.append("watermarkImage", parameters.watermarkImage);
  }

  // Required parameters with correct formatting
  formData.append("fontSize", parameters.fontSize.toString());
  formData.append("rotation", parameters.rotation.toString());
  formData.append("opacity", (parameters.opacity / 100).toString()); // Convert percentage to decimal
  formData.append("widthSpacer", parameters.widthSpacer.toString());
  formData.append("heightSpacer", parameters.heightSpacer.toString());

  // Backend-expected parameters from user input
  formData.append("alphabet", parameters.alphabet);
  formData.append("customColor", parameters.customColor);
  formData.append("convertPDFToImage", parameters.convertPDFToImage.toString());

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