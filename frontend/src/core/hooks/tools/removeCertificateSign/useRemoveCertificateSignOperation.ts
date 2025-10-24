import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemoveCertificateSignParameters, defaultParameters } from './useRemoveCertificateSignParameters';

// Static function that can be used by both the hook and automation executor
export const buildRemoveCertificateSignFormData = (_parameters: RemoveCertificateSignParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  return formData;
};

// Static configuration object
export const removeCertificateSignOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemoveCertificateSignFormData,
  operationType: 'removeCertSign',
  endpoint: '/api/v1/security/remove-cert-sign',
  defaultParameters,
} as const;

export const useRemoveCertificateSignOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemoveCertificateSignParameters>({
    ...removeCertificateSignOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('removeCertSign.error.failed', 'An error occurred while removing certificate signatures.'))
  });
};
