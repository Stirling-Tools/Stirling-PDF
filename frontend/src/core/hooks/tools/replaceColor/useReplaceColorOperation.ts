import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { ReplaceColorParameters, defaultParameters } from '@app/hooks/tools/replaceColor/useReplaceColorParameters';

export const buildReplaceColorFormData = (parameters: ReplaceColorParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  formData.append('replaceAndInvertOption', parameters.replaceAndInvertOption);

  if (parameters.replaceAndInvertOption === 'HIGH_CONTRAST_COLOR') {
    formData.append('highContrastColorCombination', parameters.highContrastColorCombination);
  } else if (parameters.replaceAndInvertOption === 'CUSTOM_COLOR') {
    formData.append('textColor', parameters.textColor);
    formData.append('backGroundColor', parameters.backGroundColor);
  }

  return formData;
};

export const replaceColorOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildReplaceColorFormData,
  operationType: 'replaceColor',
  endpoint: '/api/v1/misc/replace-invert-pdf',
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useReplaceColorOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ReplaceColorParameters>({
    ...replaceColorOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('replaceColor.error.failed', 'An error occurred while processing the colour replacement.'))
  });
};
