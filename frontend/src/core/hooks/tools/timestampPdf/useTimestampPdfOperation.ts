import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { TimestampPdfParameters, defaultParameters, CUSTOM_TSA_VALUE } from '@app/hooks/tools/timestampPdf/useTimestampPdfParameters';

export const buildTimestampPdfFormData = (parameters: TimestampPdfParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  const tsaUrl =
    parameters.tsaUrl === CUSTOM_TSA_VALUE
      ? parameters.customTsaUrl
      : parameters.tsaUrl;
  formData.append('tsaUrl', tsaUrl);

  return formData;
};

export const timestampPdfOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildTimestampPdfFormData,
  operationType: 'timestampPdf',
  endpoint: '/api/v1/security/timestamp-pdf',
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useTimestampPdfOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<TimestampPdfParameters>({
    ...timestampPdfOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('timestampPdf.error.failed', 'An error occurred while timestamping the PDF.')
    ),
  });
};
