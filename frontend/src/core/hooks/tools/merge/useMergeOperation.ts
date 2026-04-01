import { useTranslation } from 'react-i18next';
import { MergePdfsRequest } from '@app/generated/openapi';
import { defineBackendToolMapping, useToolOperation, ToolOperationConfig, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { MergeParameters, defaultParameters } from '@app/hooks/tools/merge/useMergeParameters';

type MergeApiParams = Omit<MergePdfsRequest, 'fileInput' | 'clientFileIds'>;
type FileWithOptionalId = File & { fileId?: string };

const buildFormData = (parameters: MergeParameters, files: File[]): FormData => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("fileInput", file);
  });
  // Provide stable client file IDs (align with files order)
  const clientIds: string[] = files.map((file) => {
    const fileWithId = file as FileWithOptionalId;
    return String(fileWithId.fileId ?? file.name);
  });
  formData.append('clientFileIds', JSON.stringify(clientIds));
  formData.append("sortType", "orderProvided"); // Always use orderProvided since UI handles sorting
  formData.append("removeCertSign", (parameters.removeDigitalSignature ?? false).toString());
  formData.append("generateToc", (parameters.generateTableOfContents ?? false).toString());

  return formData;
};

// Operation configuration for automation
export const mergeOperationConfig: ToolOperationConfig<MergeParameters> = {
  toolType: ToolType.multiFile,
  buildFormData,
  operationType: 'merge',
  endpoint: '/api/v1/general/merge-pdfs',
  filePrefix: 'merged_',
  defaultParameters,
  backendMapping: defineBackendToolMapping<MergeParameters, 'mergePdfs', MergeApiParams>({
    operationId: 'mergePdfs',
    toFrontendParameters: (apiParams: MergeApiParams): MergeParameters => {
      if (apiParams.sortType !== 'orderProvided') {
        throw new Error(`Unsupported merge sortType for frontend mapping: ${apiParams.sortType}`);
      }

      return {
        ...defaultParameters,
        removeDigitalSignature: apiParams.removeCertSign,
        generateTableOfContents: apiParams.generateToc ?? false,
      };
    },
    toApiParams: (parameters: MergeParameters): MergeApiParams => ({
      sortType: 'orderProvided',
      removeCertSign: parameters.removeDigitalSignature,
      generateToc: parameters.generateTableOfContents,
    }),
  }),
};

export const useMergeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<MergeParameters>({
    ...mergeOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('merge.error.failed', 'An error occurred while merging the PDFs.'))
  });
};
