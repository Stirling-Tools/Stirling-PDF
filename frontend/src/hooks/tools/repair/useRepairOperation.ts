import { useTranslation } from 'react-i18next';
import { useToolOperation } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RepairParameters } from './useRepairParameters';

export const useRepairOperation = () => {
  const { t } = useTranslation();

  const buildFormData = (parameters: RepairParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append("fileInput", file);
    return formData;
  };

  return useToolOperation<RepairParameters>({
    operationType: 'repair',
    endpoint: '/api/v1/misc/repair',
    buildFormData,
    filePrefix: t('repair.filenamePrefix', 'repaired') + '_',
    multiFileEndpoint: false,
    getErrorMessage: createStandardErrorHandler(t('repair.error.failed', 'An error occurred while repairing the PDF.'))
  });
};