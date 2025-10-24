import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { RemovePasswordParameters, defaultParameters } from '@app/hooks/tools/removePassword/useRemovePasswordParameters';

// Static function that can be used by both the hook and automation executor
export const buildRemovePasswordFormData = (parameters: RemovePasswordParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("password", parameters.password);
  return formData;
};

// Static configuration object
export const removePasswordOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemovePasswordFormData,
  operationType: 'removePassword',
  endpoint: '/api/v1/security/remove-password',
  defaultParameters,
} as const;

export const useRemovePasswordOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemovePasswordParameters>({
    ...removePasswordOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('removePassword.error.failed', 'An error occurred while removing the password from the PDF.'))
  });
};
