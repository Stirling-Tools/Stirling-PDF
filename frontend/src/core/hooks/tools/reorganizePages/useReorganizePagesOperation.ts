import { useTranslation } from 'react-i18next';
import { ToolOperationConfig, ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { ReorganizePagesParameters } from '@app/hooks/tools/reorganizePages/useReorganizePagesParameters';
import { reorganizePagesClientSide } from '@app/utils/pdfOperations/reorganizePages';

const buildFormData = (parameters: ReorganizePagesParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  if (parameters.customMode) {
    formData.append('customMode', parameters.customMode);
  }
  if (parameters.pageNumbers) {
    const cleaned = parameters.pageNumbers.replace(/\s+/g, '');
    formData.append('pageNumbers', cleaned);
  }
  return formData;
};

export const reorganizePagesOperationConfig: ToolOperationConfig<ReorganizePagesParameters> = {
  toolType: ToolType.singleFile,
  buildFormData,
  operationType: 'reorganizePages',
  endpoint: '/api/v1/general/rearrange-pages',
  frontendProcessing: {
    process: reorganizePagesClientSide,
    shouldUseFrontend: (params) => {
      if (params.processingMode !== 'frontend') return false;
      if (!params.customMode || params.customMode === '' || params.customMode === 'CUSTOM') {
        if (!params.pageNumbers.trim()) return true;
        return !params.pageNumbers.toLowerCase().includes('n');
      }
      return true;
    },
    statusMessage: 'Reordering pages in browser...'
  }
};

export const useReorganizePagesOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<ReorganizePagesParameters>({
    ...reorganizePagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('reorganizePages.error.failed', 'Failed to reorganize pages')
    )
  });
};


