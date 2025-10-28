import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType, type ToolOperationConfig } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { type OverlayPdfsParameters } from '@app/hooks/tools/overlayPdfs/useOverlayPdfsParameters';

const buildFormData = (parameters: OverlayPdfsParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);

  // Overlay files
  for (const overlay of parameters.overlayFiles || []) {
    formData.append('overlayFiles', overlay);
  }

  // Mode and position
  formData.append('overlayMode', parameters.overlayMode);
  formData.append('overlayPosition', String(parameters.overlayPosition));

  // Counts (only relevant for FixedRepeatOverlay, server accepts repeated 'counts' fields)
  if (parameters.overlayMode === 'FixedRepeatOverlay') {
    for (const count of parameters.counts || []) {
      formData.append('counts', String(count));
    }
  }

  return formData;
};

export const overlayPdfsOperationConfig: ToolOperationConfig<OverlayPdfsParameters> = {
  toolType: ToolType.singleFile,
  buildFormData,
  operationType: 'overlayPdfs',
  endpoint: '/api/v1/general/overlay-pdfs'
};

export const useOverlayPdfsOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<OverlayPdfsParameters>({
    ...overlayPdfsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('overlay-pdfs.error.failed', 'An error occurred while overlaying PDFs.')
    ),
  });
};


