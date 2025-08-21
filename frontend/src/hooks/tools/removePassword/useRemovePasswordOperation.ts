import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemovePasswordParameters } from './useRemovePasswordParameters';

export const useRemovePasswordOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: RemovePasswordParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    formData.append("password", parameters.password);
    return formData;
  };

  return useToolOperation<RemovePasswordParameters>({
    toolType: 'singleFile',
    buildFormData,
    operationType: 'removePassword',
    endpoint: '/api/v1/security/remove-password',
    filePrefix: t('removePassword.filenamePrefix', 'decrypted') + '_',
    getErrorMessage: createStandardErrorHandler(t('removePassword.error.failed', 'An error occurred while removing the password from the PDF.'))
  });
};
