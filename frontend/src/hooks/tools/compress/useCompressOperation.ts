import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { CompressParameters, defaultParameters } from './useCompressParameters';

// Static configuration that can be used by both the hook and automation executor
export const buildCompressFormData = (parameters: CompressParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);

  if (parameters.compressionMethod === 'quality') {
    formData.append("optimizeLevel", parameters.compressionLevel.toString());
  } else {
    // File size method
    const fileSize = parameters.fileSizeValue ? `${parameters.fileSizeValue}${parameters.fileSizeUnit}` : '';
    if (fileSize) {
      formData.append("expectedOutputSize", fileSize);
    }
  }

  formData.append("grayscale", parameters.grayscale.toString());
  return formData;
};

// Static configuration object
export const compressOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildCompressFormData,
  operationType: 'compress',
  endpoint: '/api/v1/misc/compress-pdf',
  filePrefix: 'compressed_',
  defaultParameters,
} as const;

export const useCompressOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CompressParameters>({
    ...compressOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('compress.error.failed', 'An error occurred while compressing the PDF.'))
  });
};
