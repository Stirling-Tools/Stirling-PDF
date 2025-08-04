import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';

export interface CompressParameters {
  compressionLevel: number;
  grayscale: boolean;
  expectedSize: string;
  compressionMethod: 'quality' | 'filesize';
  fileSizeValue: string;
  fileSizeUnit: 'KB' | 'MB';
}

const buildFormData = (parameters: CompressParameters, file: File): FormData => {
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

export const useCompressOperation = () => {
  const { t } = useTranslation();
  
  return useToolOperation<CompressParameters>({
    operationType: 'compress',
    endpoint: '/api/v1/misc/compress-pdf',
    buildFormData,
    filePrefix: 'compressed_',
    singleFileMode: false, // Process files individually
    timeout: 60000, // 1 minute timeout per file
    validateParams: (params) => {
      if (params.compressionMethod === 'filesize' && !params.fileSizeValue) {
        return { valid: false, errors: [t('compress.validation.fileSizeRequired', 'File size value is required when using filesize method')] };
      }
      return { valid: true };
    },
    getErrorMessage: createStandardErrorHandler(t('compress.error.failed', 'An error occurred while compressing the PDF.'))
  });
};
