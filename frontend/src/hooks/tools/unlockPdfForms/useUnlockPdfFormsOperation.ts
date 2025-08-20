import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { UnlockPdfFormsParameters } from './useUnlockPdfFormsParameters';

export const useUnlockPdfFormsOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: UnlockPdfFormsParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    return formData;
  };

  return useToolOperation<UnlockPdfFormsParameters>({
    operationType: 'unlockPdfForms',
    endpoint: '/api/v1/misc/unlock-pdf-forms',
    buildFormData,
    filePrefix: t('unlockPDFForms.filenamePrefix', 'unlocked_forms') + '_',
    multiFileEndpoint: false,
    getErrorMessage: createStandardErrorHandler(t('unlockPDFForms.error.failed', 'An error occurred while unlocking PDF forms.'))
  });
};