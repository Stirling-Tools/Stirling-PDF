import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { UnlockPdfFormsParameters, defaultParameters } from '@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters';

// Static function that can be used by both the hook and automation executor
export const buildUnlockPdfFormsFormData = (_parameters: UnlockPdfFormsParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  return formData;
};

// Static configuration object
export const unlockPdfFormsOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildUnlockPdfFormsFormData,
  operationType: 'unlockPDFForms',
  endpoint: '/api/v1/misc/unlock-pdf-forms',
  defaultParameters,
} as const;

export const useUnlockPdfFormsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<UnlockPdfFormsParameters>({
    ...unlockPdfFormsOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('unlockPDFForms.error.failed', 'An error occurred while unlocking PDF forms.'))
  });
};
