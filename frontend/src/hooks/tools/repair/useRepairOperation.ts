import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RepairParameters, defaultParameters } from './useRepairParameters';

// Static function that can be used by both the hook and automation executor
export const buildRepairFormData = (parameters: RepairParameters, file: File): FormData => {
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
  filePrefix: 'repaired_', // Will be overridden in hook with translation
  defaultParameters,
} as const;

export const useRepairOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RepairParameters>({
    ...repairOperationConfig,
    filePrefix: t('repair.filenamePrefix', 'repaired') + '_',
    getErrorMessage: createStandardErrorHandler(t('repair.error.failed', 'An error occurred while repairing the PDF.'))
  });
};
