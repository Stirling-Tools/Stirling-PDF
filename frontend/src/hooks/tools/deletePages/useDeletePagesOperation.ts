import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { DeletePagesParameters } from './useDeletePagesParameters';

export const useDeletePagesOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: DeletePagesParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    formData.append("pageNumbers", parameters.pageNumbers);
    return formData;
  };

  return useToolOperation<DeletePagesParameters>({
    operationType: 'deletePages',
    endpoint: '/api/v1/general/remove-pages',
    buildFormData,
    filePrefix: t('removePages.filenamePrefix', 'pages_removed') + '_',
    multiFileEndpoint: false,
    getErrorMessage: createStandardErrorHandler(t('removePages.error.failed', 'An error occurred while removing pages.'))
  });
};