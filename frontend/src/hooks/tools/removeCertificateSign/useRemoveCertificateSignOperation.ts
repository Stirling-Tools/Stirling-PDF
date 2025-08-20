import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemoveCertificateSignParameters } from './useRemoveCertificateSignParameters';

export const useRemoveCertificateSignOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: RemoveCertificateSignParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    return formData;
  };

  return useToolOperation<RemoveCertificateSignParameters>({
    operationType: 'removeCertificateSign',
    endpoint: '/api/v1/security/remove-cert-sign',
    buildFormData,
    filePrefix: t('removeCertSign.filenamePrefix', 'unsigned') + '_',
    multiFileEndpoint: false,
    getErrorMessage: createStandardErrorHandler(t('removeCertSign.error.failed', 'An error occurred while removing certificate signatures.'))
  });
};