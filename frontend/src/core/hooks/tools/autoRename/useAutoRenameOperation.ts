import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { AutoRenameParameters, defaultParameters } from '@app/hooks/tools/autoRename/useAutoRenameParameters';

export const getFormData = ((parameters: AutoRenameParameters) =>
  Object.entries(parameters).map(([key, value]) =>
    [key, value.toString()]
  ) as string[][]
);

// Static function that can be used by both the hook and automation executor
export const buildAutoRenameFormData = (parameters: AutoRenameParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  // Add all permission parameters
  getFormData(parameters).forEach(([key, value]) => {
    formData.append(key, value);
  });

  return formData;
};

// Static configuration object
export const autoRenameOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAutoRenameFormData,
  operationType: 'autoRename',
  endpoint: '/api/v1/misc/auto-rename',
  preserveBackendFilename: true, // Use filename from backend response headers
  defaultParameters,
} as const;

export const useAutoRenameOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...autoRenameOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('auto-rename.error.failed', 'An error occurred while auto-renaming the PDF.'))
  });
};
