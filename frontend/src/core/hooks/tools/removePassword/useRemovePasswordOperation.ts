import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { RemovePasswordParameters, defaultParameters } from '@app/hooks/tools/removePassword/useRemovePasswordParameters';
import { buildRemovePasswordFormData } from '@app/hooks/tools/removePassword/buildRemovePasswordFormData';

// Re-export for backwards compatibility with any other imports
export { buildRemovePasswordFormData };

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
