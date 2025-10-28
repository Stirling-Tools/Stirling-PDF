import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { BookletImpositionParameters, defaultParameters } from './useBookletImpositionParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildBookletImpositionFormData = (parameters: BookletImpositionParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("pagesPerSheet", parameters.pagesPerSheet.toString());
  formData.append("addBorder", parameters.addBorder.toString());
  formData.append("spineLocation", parameters.spineLocation);
  formData.append("addGutter", parameters.addGutter.toString());
  formData.append("gutterSize", parameters.gutterSize.toString());
  formData.append("doubleSided", parameters.doubleSided.toString());
  formData.append("duplexPass", parameters.duplexPass);
  formData.append("flipOnShortEdge", parameters.flipOnShortEdge.toString());
  return formData;
};

// Static configuration object
export const bookletImpositionOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildBookletImpositionFormData,
  operationType: 'bookletImposition',
  endpoint: '/api/v1/general/booklet-imposition',
  defaultParameters,
} as const;

export const useBookletImpositionOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<BookletImpositionParameters>({
    ...bookletImpositionOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('bookletImposition.error.failed', 'An error occurred while creating the booklet imposition.'))
  });
};