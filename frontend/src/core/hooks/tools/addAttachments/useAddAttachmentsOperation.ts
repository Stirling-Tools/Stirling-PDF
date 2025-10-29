import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolOperationConfig, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { AddAttachmentsParameters } from '@app/hooks/tools/addAttachments/useAddAttachmentsParameters';

const buildFormData = (parameters: AddAttachmentsParameters, file: File): FormData => {
  const formData = new FormData();

  // Add the main PDF file (single file per request in singleFile mode)
  if (file) {
    formData.append("fileInput", file);
  }

  // Add attachment files
  (parameters.attachments || []).forEach((attachment) => {
    if (attachment) formData.append("attachments", attachment);
  });

  return formData;
};

// Operation configuration for automation
export const addAttachmentsOperationConfig: ToolOperationConfig<AddAttachmentsParameters> = {
  toolType: ToolType.singleFile,
  buildFormData,
  operationType: 'addAttachments',
  endpoint: '/api/v1/misc/add-attachments',
};

export const useAddAttachmentsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddAttachmentsParameters>({
    ...addAttachmentsOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('addAttachments.error.failed', 'An error occurred while adding attachments to the PDF.'))
  });
};
