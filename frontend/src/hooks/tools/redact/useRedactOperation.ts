import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RedactParameters, defaultParameters } from './useRedactParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildRedactFormData = (parameters: RedactParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  if (parameters.mode === 'automatic') {
    formData.append("listOfText", parameters.listOfText);
    formData.append("useRegex", parameters.useRegex.toString());
    formData.append("wholeWordSearch", parameters.wholeWordSearch.toString());
    formData.append("redactColor", parameters.redactColor.replace('#', ''));
    formData.append("customPadding", parameters.customPadding.toString());
    formData.append("convertPDFToImage", parameters.convertPDFToImage.toString());
  } else {
    // Manual mode parameters would go here when implemented
    throw new Error('Manual redaction not yet implemented');
  }

  return formData;
};

// Static configuration object
export const redactOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRedactFormData,
  operationType: 'redact',
  endpoint: (parameters: RedactParameters) => {
    if (parameters.mode === 'automatic') {
      return '/api/v1/security/auto-redact';
    } else {
      // Manual redaction endpoint would go here when implemented
      throw new Error('Manual redaction not yet implemented');
    }
  },
  filePrefix: 'redacted_',
  defaultParameters,
} as const;

export const useRedactOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RedactParameters>({
    ...redactOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('redact.error.failed', 'An error occurred while redacting the PDF.'))
  });
};
