import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { RedactParameters, defaultParameters } from '@app/hooks/tools/redact/useRedactParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildRedactFormData = (parameters: RedactParameters, file: File): FormData => {
  const formData = new FormData();

  // For automatic mode we hit the backend and need full payload
  if (parameters.mode === 'automatic') {
    formData.append("fileInput", file);
    // Convert array to newline-separated string as expected by backend
    formData.append("listOfText", parameters.wordsToRedact.join('\n'));
    formData.append("useRegex", parameters.useRegex.toString());
    formData.append("wholeWordSearch", parameters.wholeWordSearch.toString());
    formData.append("redactColor", parameters.redactColor.replace('#', ''));
    formData.append("customPadding", parameters.customPadding.toString());
    formData.append("convertPDFToImage", parameters.convertPDFToImage.toString());
  } else {
    // Manual redaction uses EmbedPDF in-viewer; we don't call the API.
    // Return an empty formData to satisfy shared interfaces without throwing.
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
    }
    // Manual redaction is handled by EmbedPDF in the viewer; no endpoint call.
    return null;
  },
  defaultParameters,
} as const;

export const useRedactOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RedactParameters>({
    ...redactOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('redact.error.failed', 'An error occurred while redacting the PDF.'))
  });
};
