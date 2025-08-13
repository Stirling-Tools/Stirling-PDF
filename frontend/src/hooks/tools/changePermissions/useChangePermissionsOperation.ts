import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import type { ChangePermissionsParameters } from './useChangePermissionsParameters';

export const useChangePermissionsOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: ChangePermissionsParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);

    // Add all permission parameters
    formData.append("preventAssembly", parameters.preventAssembly.toString());
    formData.append("preventExtractContent", parameters.preventExtractContent.toString());
    formData.append("preventExtractForAccessibility", parameters.preventExtractForAccessibility.toString());
    formData.append("preventFillInForm", parameters.preventFillInForm.toString());
    formData.append("preventModify", parameters.preventModify.toString());
    formData.append("preventModifyAnnotations", parameters.preventModifyAnnotations.toString());
    formData.append("preventPrinting", parameters.preventPrinting.toString());
    formData.append("preventPrintingFaithful", parameters.preventPrintingFaithful.toString());

    return formData;
  };

  return useToolOperation({
    operationType: 'changePermissions',
    endpoint: '/api/v1/security/add-password', // Change Permissions is a fake endpoint for the Add Password tool
    buildFormData,
    filePrefix: 'permissions_',
    multiFileEndpoint: false,
    getErrorMessage: createStandardErrorHandler(
      t('changePermissions.error.failed', 'An error occurred while changing PDF permissions.')
    )
  });
};
