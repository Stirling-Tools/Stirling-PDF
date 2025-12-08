import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolOperationHook, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { SignParameters, DEFAULT_PARAMETERS } from '@app/hooks/tools/sign/useSignParameters';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';

// Static configuration that can be used by both the hook and automation executor
export const buildSignFormData = (params: SignParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  // Add signature data if available
  if (params.signatureData) {
    formData.append('signatureData', params.signatureData);
  }

  // Add signature position and size
  if (params.signaturePosition) {
    formData.append('x', params.signaturePosition.x.toString());
    formData.append('y', params.signaturePosition.y.toString());
    formData.append('width', params.signaturePosition.width.toString());
    formData.append('height', params.signaturePosition.height.toString());
    formData.append('page', params.signaturePosition.page.toString());
  }

  // Add signature type
  formData.append('signatureType', params.signatureType || 'canvas');

  // Add other parameters
  if (params.reason) {
    formData.append('reason', params.reason);
  }
  if (params.location) {
    formData.append('location', params.location);
  }
  if (params.signerName) {
    formData.append('signerName', params.signerName);
  }

  return formData;
};

// Static configuration object
export const signOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildSignFormData,
  operationType: 'sign',
  endpoint: '/api/v1/security/add-signature',
  filePrefix: 'signed_',
  defaultParameters: DEFAULT_PARAMETERS,
} as const;

export const useSignOperation = (): ToolOperationHook<SignParameters> => {
  const { t } = useTranslation();

  return useToolOperation<SignParameters>({
    ...signOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('sign.error.failed', 'An error occurred while signing the PDF.'))
  });
};
