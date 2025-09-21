import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolOperationConfig, ToolType } from '../shared/useToolOperation';
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

// Operation configuration for automation
export const mergeOperationConfig: ToolOperationConfig<MergeParameters> = {
  toolType: ToolType.multiFile,
  buildFormData,
  operationType: 'merge',
  endpoint: '/api/v1/general/merge-pdfs',
  filePrefix: 'merged_',
};

export const useMergeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<MergeParameters>({
    ...mergeOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('merge.error.failed', 'An error occurred while merging the PDFs.'))
  });
};
