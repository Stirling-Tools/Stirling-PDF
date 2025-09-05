import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { UnlockPdfFormsParameters, defaultParameters } from './useUnlockPdfFormsParameters';

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
  operationType: 'unlock-pdf-forms',
  endpoint: '/api/v1/misc/unlock-pdf-forms',
  filePrefix: 'unlocked_forms_', // Will be overridden in hook with translation
  defaultParameters,
} as const;

export const useUnlockPdfFormsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<UnlockPdfFormsParameters>({
    ...unlockPdfFormsOperationConfig,
    filePrefix: t('unlockPDFForms.filenamePrefix', 'unlocked_forms') + '_',
    getErrorMessage: createStandardErrorHandler(t('unlockPDFForms.error.failed', 'An error occurred while unlocking PDF forms.'))
  });
};
