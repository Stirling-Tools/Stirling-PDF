import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { AddPasswordParameters } from './useAddPasswordParameters';

const buildFormData = (parameters: AddPasswordParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("password", parameters.password);
  formData.append("ownerPassword", parameters.ownerPassword);
  formData.append("keyLength", parameters.keyLength.toString());
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

export const useAddPasswordOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddPasswordParameters>({
    operationType: 'addPassword',
    endpoint: '/api/v1/security/add-password',
    buildFormData,
    filePrefix: t('addPassowrd.filenamePrefix', 'encrypted') + '_',
    multiFileEndpoint: false,
    getErrorMessage: createStandardErrorHandler(t('addPassword.error.failed', 'An error occurred while encrypting the PDF.'))
  });
};
