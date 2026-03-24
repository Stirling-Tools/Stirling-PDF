import { useTranslation } from 'react-i18next';
import { AddWatermarkRequest } from '@app/generated/openapi';
import { defineBackendToolMapping, ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { AddWatermarkParameters, defaultParameters } from '@app/hooks/tools/addWatermark/useAddWatermarkParameters';

type WatermarkApiParams = Omit<AddWatermarkRequest, 'fileInput' | 'fileId'>;

// Static function that can be used by both the hook and automation executor
export const buildAddWatermarkFormData = (parameters: AddWatermarkParameters, file: File): FormData => {
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

  // Required parameters with correct formatting (defaults merged in automationExecutor)
  formData.append("fontSize", parameters.fontSize.toString());
  formData.append("rotation", parameters.rotation.toString());
  formData.append("opacity", (parameters.opacity / 100).toString()); // Convert percentage to decimal
  formData.append("widthSpacer", parameters.widthSpacer.toString());
  formData.append("heightSpacer", parameters.heightSpacer.toString());

  // Backend-expected parameters from user input
  formData.append("alphabet", parameters.alphabet || "");
  formData.append("customColor", parameters.customColor || "");
  formData.append("convertPDFToImage", (parameters.convertPDFToImage ?? false).toString());

  return formData;
};

// Static configuration object
export const addWatermarkOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAddWatermarkFormData,
  operationType: 'watermark',
  endpoint: '/api/v1/security/add-watermark',
  defaultParameters,
  backendMapping: defineBackendToolMapping<AddWatermarkParameters, 'addWatermark', WatermarkApiParams>({
    operationId: 'addWatermark',
    toFrontendParameters: (apiParams: WatermarkApiParams): AddWatermarkParameters => {
      if (apiParams.watermarkType === 'image' && !apiParams.watermarkImage) {
        throw new Error('Watermark image requests require a watermarkImage file, which is not available in frontend plan mapping.');
      }

      return {
        ...defaultParameters,
        watermarkType: apiParams.watermarkType,
        watermarkText: apiParams.watermarkText ?? '',
        watermarkImage: apiParams.watermarkImage,
        fontSize: apiParams.fontSize ?? defaultParameters.fontSize,
        rotation: apiParams.rotation ?? defaultParameters.rotation,
        opacity: Math.round((apiParams.opacity ?? defaultParameters.opacity / 100) * 100),
        widthSpacer: apiParams.widthSpacer ?? defaultParameters.widthSpacer,
        heightSpacer: apiParams.heightSpacer ?? defaultParameters.heightSpacer,
        alphabet: (apiParams.alphabet ?? defaultParameters.alphabet) as AddWatermarkParameters['alphabet'],
        customColor: apiParams.customColor ?? defaultParameters.customColor,
        convertPDFToImage: apiParams.convertPDFToImage,
      };
    },
    toApiParams: (parameters: AddWatermarkParameters): WatermarkApiParams => ({
      watermarkType: parameters.watermarkType ?? 'text',
      watermarkText: parameters.watermarkText,
      watermarkImage: parameters.watermarkImage,
      alphabet: parameters.alphabet as WatermarkApiParams['alphabet'],
      fontSize: parameters.fontSize,
      rotation: parameters.rotation,
      opacity: parameters.opacity / 100,
      widthSpacer: parameters.widthSpacer,
      heightSpacer: parameters.heightSpacer,
      customColor: parameters.customColor,
      convertPDFToImage: parameters.convertPDFToImage,
    }),
  }),
} as const;

export const useAddWatermarkOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddWatermarkParameters>({
    ...addWatermarkOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('watermark.error.failed', 'An error occurred while adding watermark to the PDF.'))
  });
};
