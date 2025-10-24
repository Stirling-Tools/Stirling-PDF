import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { ChangePermissionsParameters, defaultParameters } from './useChangePermissionsParameters';

export const getFormData = ((parameters: ChangePermissionsParameters) =>
  Object.entries(parameters).map(([key, value]) =>
    [key, value.toString()]
  ) as string[][]
);

// Static function that can be used by both the hook and automation executor
export const buildChangePermissionsFormData = (parameters: ChangePermissionsParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  // Add all permission parameters
  getFormData(parameters).forEach(([key, value]) => {
    formData.append(key, value);
  });

  return formData;
};

// Static configuration object
export const changePermissionsOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildChangePermissionsFormData,
  operationType: 'changePermissions',
  endpoint: '/api/v1/security/add-password', // Change Permissions is a fake endpoint for the Add Password tool
  defaultParameters,
} as const;

export const useChangePermissionsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...changePermissionsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('changePermissions.error.failed', 'An error occurred while changing PDF permissions.')
    ),
  });
};
