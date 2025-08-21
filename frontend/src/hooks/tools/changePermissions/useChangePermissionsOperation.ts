import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import type { ChangePermissionsParameters } from './useChangePermissionsParameters';

export const getFormData = ((parameters: ChangePermissionsParameters) =>
  Object.entries(parameters).map(([key, value]) =>
    [key, value.toString()]
  ) as string[][]
);

export const useChangePermissionsOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: ChangePermissionsParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);

    // Add all permission parameters
    getFormData(parameters).forEach(([key, value]) => {
      formData.append(key, value);
    });

    return formData;
  };

  return useToolOperation({
    toolType: 'singleFile',
    buildFormData,
    operationType: 'changePermissions',
    endpoint: '/api/v1/security/add-password', // Change Permissions is a fake endpoint for the Add Password tool
    filePrefix: 'permissions_',
    getErrorMessage: createStandardErrorHandler(
      t('changePermissions.error.failed', 'An error occurred while changing PDF permissions.')
    ),
  });
};
