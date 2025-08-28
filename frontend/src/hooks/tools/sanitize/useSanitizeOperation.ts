import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SanitizeParameters, defaultParameters } from './useSanitizeParameters';

// Static function that can be used by both the hook and automation executor
export const buildSanitizeFormData = (parameters: SanitizeParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  // Add parameters
  formData.append('removeJavaScript', parameters.removeJavaScript.toString());
  formData.append('removeEmbeddedFiles', parameters.removeEmbeddedFiles.toString());
  formData.append('removeXMPMetadata', parameters.removeXMPMetadata.toString());
  formData.append('removeMetadata', parameters.removeMetadata.toString());
  formData.append('removeLinks', parameters.removeLinks.toString());
  formData.append('removeFonts', parameters.removeFonts.toString());

  return formData;
};

// Static configuration object
export const sanitizeOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildSanitizeFormData,
  operationType: 'sanitize',
  endpoint: '/api/v1/security/sanitize-pdf',
  filePrefix: 'sanitized_', // Will be overridden in hook with translation
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useSanitizeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SanitizeParameters>({
    ...sanitizeOperationConfig,
    filePrefix: t('sanitize.filenamePrefix', 'sanitized') + '_',
    getErrorMessage: createStandardErrorHandler(t('sanitize.error.failed', 'An error occurred while sanitising the PDF.'))
  });
};
