import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { ChangeMetadataParameters, defaultParameters } from './useChangeMetadataParameters';

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

  // Date fields
  formData.append("creationDate", parameters.creationDate || "");
  formData.append("modificationDate", parameters.modificationDate || "");

  // Trapped status
  formData.append("trapped", parameters.trapped || "");

  // Delete all metadata flag
  formData.append("deleteAll", parameters.deleteAll.toString());

  // Custom metadata - need to match backend's customKey/customValue pattern
  let keyNumber = 0;
  parameters.customMetadata.forEach((entry) => {
    if (entry.key.trim() && entry.value.trim()) {
      keyNumber += 1;
      formData.append(`customKey${keyNumber}`, entry.key.trim());
      formData.append(`customValue${keyNumber}`, entry.value.trim());
    }
  });

  return formData;
};

// Static configuration object
export const changeMetadataOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildChangeMetadataFormData,
  operationType: 'changeMetadata',
  endpoint: '/api/v1/misc/update-metadata',
  filePrefix: 'metadata_',
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
