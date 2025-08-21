import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { AutoRenameParameters } from './useAutoRenameParameters';

export const useAutoRenameOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: AutoRenameParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    formData.append("useFirstTextAsFallback", parameters.useFirstTextAsFallback.toString());
    return formData;
  };

  return useToolOperation<AutoRenameParameters>({
    operationType: 'autoRename',
    endpoint: '/api/v1/misc/auto-rename',
    buildFormData,
    filePrefix: '', // Not used when preserveBackendFilename is true
    multiFileEndpoint: false,
    preserveBackendFilename: true, // Use filename from backend response headers
    getErrorMessage: createStandardErrorHandler(t('auto-rename.error.failed', 'An error occurred while auto-renaming the PDF.'))
  });
};