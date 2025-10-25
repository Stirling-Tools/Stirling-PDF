import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemovePagesParameters, defaultParameters } from './useRemovePagesParameters';
// import { useToolResources } from '../shared/useToolResources';
import { removePagesClientSide } from '../../../utils/pdfOperations/removePages';

export const buildRemovePagesFormData = (parameters: RemovePagesParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  const cleaned = parameters.pageNumbers.replace(/\s+/g, '');
  formData.append('pageNumbers', cleaned);
  return formData;
};

export const removePagesOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRemovePagesFormData,
  operationType: 'removePages',
  endpoint: '/api/v1/general/remove-pages',
  defaultParameters,
  frontendProcessing: {
    process: removePagesClientSide,
    shouldUseFrontend: (params: RemovePagesParameters) => {
      const raw = params.pageNumbers?.trim();
      if (!raw) return false;
      const parts = raw.replace(/\s+/g, '').split(',').filter(Boolean);
      return parts.every((part) => {
        const token = part.toLowerCase();
        if (token === 'all') return true;
        if (token.includes('n')) return false;
        return /^\d+$/.test(token) || /^\d+-\d+$/.test(token) || /^\d+-$/.test(token);
      });
    },
    statusMessage: 'Removing pages in browser...'
  }
} as const satisfies ToolOperationConfig<RemovePagesParameters>;

export const useRemovePagesOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemovePagesParameters>({
    ...removePagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('removePages.error.failed', 'Failed to remove pages')
    )
  });
};
