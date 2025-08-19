import { useTranslation } from 'react-i18next';
import { useToolOperation, ResponseHandler } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { MergeParameters } from './useMergeParameters';

const buildFormData = (parameters: MergeParameters, files: File[]): FormData => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("fileInput", file);
  });
  formData.append("sortType", "orderProvided"); // Always use orderProvided since UI handles sorting
  formData.append("removeCertSign", parameters.removeDigitalSignature.toString());
  formData.append("generateToc", parameters.generateTableOfContents.toString());

  return formData;
};

const mergeResponseHandler: ResponseHandler = (blob: Blob, originalFiles: File[]): File[] => {
  return [new File([blob], 'merged.pdf', { type: 'application/pdf' })];
};

export const useMergeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<MergeParameters>({
    operationType: 'merge',
    endpoint: '/api/v1/general/merge-pdfs',
    buildFormData,
    filePrefix: 'merged_',
    multiFileEndpoint: true, // Single API call with all files
    responseHandler: mergeResponseHandler, // Handle single PDF response
    getErrorMessage: createStandardErrorHandler(t('merge.error.failed', 'An error occurred while merging the PDFs.'))
  });
};
