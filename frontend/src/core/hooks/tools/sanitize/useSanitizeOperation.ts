import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { SanitizeParameters, defaultParameters } from '@app/hooks/tools/sanitize/useSanitizeParameters';

// Static function that can be used by both the hook and automation executor
export const buildSanitizeFormData = (parameters: SanitizeParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  // Add parameters
  formData.append('removeJavaScript', (parameters.removeJavaScript ?? false).toString());
  formData.append('removeEmbeddedFiles', (parameters.removeEmbeddedFiles ?? false).toString());
  formData.append('removeXMPMetadata', (parameters.removeXMPMetadata ?? false).toString());
  formData.append('removeMetadata', (parameters.removeMetadata ?? false).toString());
  formData.append('removeLinks', (parameters.removeLinks ?? false).toString());
  formData.append('removeFonts', (parameters.removeFonts ?? false).toString());

  return formData;
};

// Static configuration object
export const sanitizeOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildSanitizeFormData,
  operationType: 'sanitize',
  endpoint: '/api/v1/security/sanitize-pdf',
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useSanitizeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SanitizeParameters>({
    ...sanitizeOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('sanitize.error.failed', 'An error occurred while sanitising the PDF.'))
  });
};
