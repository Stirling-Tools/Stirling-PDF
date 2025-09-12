import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RotateParameters, defaultParameters } from './useRotateParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildRotateFormData = (parameters: RotateParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("angle", parameters.angle.toString());
  return formData;
};

// Static configuration object
export const rotateOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRotateFormData,
  operationType: 'rotate',
  endpoint: '/api/v1/general/rotate-pdf',
  filePrefix: 'rotated_',
  defaultParameters,
} as const;

export const useRotateOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RotateParameters>({
    ...rotateOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('rotate.error.failed', 'An error occurred while rotating the PDF.'))
  });
};
