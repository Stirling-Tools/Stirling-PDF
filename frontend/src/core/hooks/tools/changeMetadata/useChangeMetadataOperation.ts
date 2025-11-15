import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { ChangeMetadataParameters, defaultParameters } from '@app/hooks/tools/changeMetadata/useChangeMetadataParameters';

// Helper function to format Date object to string
const formatDateForBackend = (date: Date | null): string => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
};

// Static function that can be used by both the hook and automation executor
export const buildChangeMetadataFormData = (parameters: ChangeMetadataParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  // Standard metadata fields
  formData.append("title", parameters.title || "");
  formData.append("author", parameters.author || "");
  formData.append("subject", parameters.subject || "");
  formData.append("keywords", parameters.keywords || "");
  formData.append("creator", parameters.creator || "");
  formData.append("producer", parameters.producer || "");

  // Date fields - convert Date objects to strings
  formData.append("creationDate", formatDateForBackend(parameters.creationDate));
  formData.append("modificationDate", formatDateForBackend(parameters.modificationDate));

  // Trapped status
  formData.append("trapped", parameters.trapped || "");

  // Delete all metadata flag
  formData.append("deleteAll", parameters.deleteAll.toString());

  // Custom metadata - backend expects them as values to 'allRequestParams[customKeyX/customValueX]'
  let keyNumber = 0;
  if (parameters.customMetadata && Array.isArray(parameters.customMetadata)) {
    parameters.customMetadata.forEach((entry) => {
      if (entry.key.trim() && entry.value.trim()) {
        keyNumber += 1;
        formData.append(`allRequestParams[customKey${keyNumber}]`, entry.key.trim());
        formData.append(`allRequestParams[customValue${keyNumber}]`, entry.value.trim());
      }
    });
  }

  return formData;
};

// Static configuration object
export const changeMetadataOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildChangeMetadataFormData,
  operationType: 'changeMetadata',
  endpoint: '/api/v1/misc/update-metadata',
  defaultParameters,
} as const;

export const useChangeMetadataOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ChangeMetadataParameters>({
    ...changeMetadataOperationConfig,
    filePrefix: t('changeMetadata.filenamePrefix', 'metadata') + '_',
    getErrorMessage: createStandardErrorHandler(t('changeMetadata.error.failed', 'An error occurred while changing the PDF metadata.'))
  });
};
