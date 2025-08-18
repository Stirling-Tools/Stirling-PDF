import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemoveCertificateSignParameters, defaultParameters } from './useRemoveCertificateSignParameters';

// Static function that can be used by both the hook and automation executor
export const buildRemoveCertificateSignFormData = (parameters: RemoveCertificateSignParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  return formData;
};

// Static configuration object
export const removeCertificateSignOperationConfig = {
  toolType: 'singleFile',
  buildFormData: buildRemoveCertificateSignFormData,
  operationType: 'remove-certificate-sign',
  endpoint: '/api/v1/security/remove-cert-sign',
  filePrefix: 'unsigned_', // Will be overridden in hook with translation
  defaultParameters,
} as const;

export const useRemoveCertificateSignOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemoveCertificateSignParameters>({
    ...removeCertificateSignOperationConfig,
    filePrefix: t('removeCertSign.filenamePrefix', 'unsigned') + '_',
    getErrorMessage: createStandardErrorHandler(t('removeCertSign.error.failed', 'An error occurred while removing certificate signatures.'))
  });
};
