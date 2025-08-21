import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SanitizeParameters } from './useSanitizeParameters';

const buildFormData = (parameters: SanitizeParameters, file: File): FormData => {
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

export const useSanitizeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SanitizeParameters>({
    toolType: 'singleFile',
    buildFormData,
    operationType: 'sanitize',
    endpoint: '/api/v1/security/sanitize-pdf',
    filePrefix: t('sanitize.filenamePrefix', 'sanitized') + '_',
    getErrorMessage: createStandardErrorHandler(t('sanitize.error.failed', 'An error occurred while sanitising the PDF.'))
  });
};
