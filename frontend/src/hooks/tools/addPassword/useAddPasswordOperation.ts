import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { AddPasswordFullParameters } from './useAddPasswordParameters';
import { getFormData } from '../changePermissions/useChangePermissionsOperation';

export const useAddPasswordOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: AddPasswordFullParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    formData.append("password", parameters.password);
    formData.append("ownerPassword", parameters.ownerPassword);
    formData.append("keyLength", parameters.keyLength.toString());
    getFormData(parameters.permissions).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return formData;
  };

  return useToolOperation<AddPasswordFullParameters>({
    toolType: 'singleFile',
    buildFormData,
    operationType: 'addPassword',
    endpoint: '/api/v1/security/add-password',
    filePrefix: t('addPassword.filenamePrefix', 'encrypted') + '_',
    getErrorMessage: createStandardErrorHandler(t('addPassword.error.failed', 'An error occurred while encrypting the PDF.')),
  });
};
