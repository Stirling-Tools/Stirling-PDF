import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { CompressParameters, defaultParameters } from '@app/hooks/tools/compress/useCompressParameters';

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
  formData.append("lineArt", parameters.lineArt.toString());
  formData.append("linearize", parameters.linearize.toString());
  if (parameters.lineArt) {
    formData.append("lineArtThreshold", parameters.lineArtThreshold.toString());
    formData.append("lineArtEdgeLevel", parameters.lineArtEdgeLevel.toString());
  }
  return formData;
};

// Static configuration object
export const compressOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildCompressFormData,
  operationType: 'compress',
  endpoint: '/api/v1/misc/compress-pdf',
  defaultParameters,
} as const;

export const useCompressOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CompressParameters>({
    ...compressOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('compress.error.failed', 'An error occurred while compressing the PDF.'))
  });
};
