import { useTranslation } from 'react-i18next';
import { ToolType, useToolOperation, ToolOperationConfig } from '../../../hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { AddPageNumbersParameters, defaultParameters } from './useAddPageNumbersParameters';
import { addPageNumbersClientSide } from '../../../utils/pdfOperations/addPageNumbers';
import { validatePageNumbers } from '../../../utils/pageSelection';

export const buildAddPageNumbersFormData = (parameters: AddPageNumbersParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  formData.append('customMargin', parameters.customMargin);
  formData.append('position', String(parameters.position));
  formData.append('fontSize', String(parameters.fontSize));
  formData.append('fontType', parameters.fontType);
  formData.append('startingNumber', String(parameters.startingNumber));
  formData.append('pagesToNumber', parameters.pagesToNumber);
  formData.append('customText', parameters.customText);

  return formData;
};

export const addPageNumbersOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAddPageNumbersFormData,
  operationType: 'addPageNumbers',
  endpoint: '/api/v1/misc/add-page-numbers',
  defaultParameters,
  frontendProcessing: {
    process: addPageNumbersClientSide,
    shouldUseFrontend: (params) => {
      if (params.processingMode !== 'frontend') return false;
      const selection = params.pagesToNumber?.trim();
      if (!selection) return true;
      if (selection.toLowerCase().includes('n')) return false;
      return validatePageNumbers(selection);
    },
    statusMessage: 'Adding page numbers in browser...'
  }
} as const satisfies ToolOperationConfig<AddPageNumbersParameters>;

export const useAddPageNumbersOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddPageNumbersParameters>({
    ...addPageNumbersOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t('addPageNumbers.error.failed', 'An error occurred while adding page numbers to the PDF.')
    ),
  });
};