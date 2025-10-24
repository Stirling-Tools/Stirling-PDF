import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { RotateParameters, defaultParameters, normalizeAngle } from '@app/hooks/tools/rotate/useRotateParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildRotateFormData = (parameters: RotateParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  // Normalize angle for backend (0, 90, 180, 270)
  formData.append("angle", normalizeAngle(parameters.angle).toString());
  return formData;
};

// Static configuration object
export const rotateOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRotateFormData,
  operationType: 'rotate',
  endpoint: '/api/v1/general/rotate-pdf',
  defaultParameters,
} as const;

export const useRotateOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RotateParameters>({
    ...rotateOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('rotate.error.failed', 'An error occurred while rotating the PDF.'))
  });
};
