import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { SingleLargePageParameters } from './useSingleLargePageParameters';

export const useSingleLargePageOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: SingleLargePageParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    return formData;
  };

  return useToolOperation<SingleLargePageParameters>({
    operationType: 'singleLargePage',
    endpoint: '/api/v1/misc/pdf-to-single-page',
    buildFormData,
    filePrefix: t('pdfToSinglePage.filenamePrefix', 'single_page') + '_',
    multiFileEndpoint: false,
    getErrorMessage: createStandardErrorHandler(t('pdfToSinglePage.error.failed', 'An error occurred while converting to single page.'))
  });
};