import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { AddStampParameters, defaultParameters } from '@app/components/tools/addStamp/useAddStampParameters';

export const buildAddStampFormData = (parameters: AddStampParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('pageNumbers', parameters.pageNumbers);
  formData.append('customMargin', parameters.customMargin || 'medium'); 
  formData.append('position', String(parameters.position));
  const effectiveFontSize = parameters.fontSize;
  formData.append('fontSize', String(effectiveFontSize));
  formData.append('rotation', String(parameters.rotation));
  formData.append('opacity', String(parameters.opacity / 100));
  formData.append('overrideX', String(parameters.overrideX));
  formData.append('overrideY', String(parameters.overrideY));
  formData.append('customColor', parameters.customColor.startsWith('#') ? parameters.customColor : `#${parameters.customColor}`);
  formData.append('alphabet', parameters.alphabet);

  // Stamp type and payload
  formData.append('stampType', parameters.stampType || 'text');
  if (parameters.stampType === 'text') {
    formData.append('stampText', parameters.stampText);
  } else if (parameters.stampType === 'image' && parameters.stampImage) {
    formData.append('stampImage', parameters.stampImage);
  }

  return formData;
};

export const addStampOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAddStampFormData,
  operationType: 'addStamp',
  endpoint: '/api/v1/misc/add-stamp',
  defaultParameters,
} as const;

export const useAddStampOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddStampParameters>({
    ...addStampOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('AddStampRequest.error.failed', 'An error occurred while adding stamp to the PDF.')
    ),
  });
};


