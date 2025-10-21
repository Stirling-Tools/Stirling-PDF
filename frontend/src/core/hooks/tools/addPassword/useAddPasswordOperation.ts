import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { AddPasswordFullParameters, defaultParameters } from '@app/hooks/tools/addPassword/useAddPasswordParameters';
import { defaultParameters as permissionsDefaults } from '@app/hooks/tools/changePermissions/useChangePermissionsParameters';
import { getFormData } from '@app/hooks/tools/changePermissions/useChangePermissionsOperation';

// Static function that can be used by both the hook and automation executor
export const buildAddPasswordFormData = (parameters: AddPasswordFullParameters, file: File): FormData => {
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

// Full default parameters including permissions for automation
const fullDefaultParameters: AddPasswordFullParameters = {
  ...defaultParameters,
  permissions: permissionsDefaults,
};

// Static configuration object
export const addPasswordOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAddPasswordFormData,
  operationType: 'addPassword',
  endpoint: '/api/v1/security/add-password',
  defaultParameters: fullDefaultParameters,
} as const;

export const useAddPasswordOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddPasswordFullParameters>({
    ...addPasswordOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('addPassword.error.failed', 'An error occurred while encrypting the PDF.'))
  });
};
