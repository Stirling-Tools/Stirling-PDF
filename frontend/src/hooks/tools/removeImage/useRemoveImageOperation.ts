import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolOperationConfig, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import type { RemoveImageParameters } from './useRemoveImageParameters';

export const buildRemoveImageFormData = (_params: RemoveImageParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  return formData;
};

export const removeImageOperationConfig: ToolOperationConfig<RemoveImageParameters> = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemoveImageFormData,
  operationType: 'removeImage',
  endpoint: '/api/v1/general/remove-image-pdf',
};

export const useRemoveImageOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemoveImageParameters>({
    ...removeImageOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('removeImage.error.failed', 'Failed to remove images from the PDF.')
    ),
  });
};


