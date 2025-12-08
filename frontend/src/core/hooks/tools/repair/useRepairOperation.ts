import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { RepairParameters, defaultParameters } from '@app/hooks/tools/repair/useRepairParameters';

// Static function that can be used by both the hook and automation executor
export const buildRepairFormData = (_parameters: RepairParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  return formData;
};

// Static configuration object
export const repairOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRepairFormData,
  operationType: 'repair',
  endpoint: '/api/v1/misc/repair',
  defaultParameters,
} as const;

export const useRepairOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RepairParameters>({
    ...repairOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('repair.error.failed', 'An error occurred while repairing the PDF.'))
  });
};
