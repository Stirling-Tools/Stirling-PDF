import { useToolOperation } from '../shared/useToolOperation';

export interface CompressParameters {
  compressionLevel: number;
  grayscale: boolean;
  expectedSize: string;
  compressionMethod: 'quality' | 'filesize';
  fileSizeValue: string;
  fileSizeUnit: 'KB' | 'MB';
}

export interface CompressOperationHook {
  executeOperation: (
    parameters: CompressParameters,
    selectedFiles: File[]
  ) => Promise<void>;

  // Flattened result properties for cleaner access
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
  downloadUrl: string | null;
  downloadFilename: string;
  status: string;
  errorMessage: string | null;
  isLoading: boolean;

  // Result management functions
  resetResults: () => void;
  clearError: () => void;
}

export const useCompressOperation = (): CompressOperationHook => {
  const toolOperation = useToolOperation<CompressParameters>({
    operationType: 'compress',
    endpoint: '/api/v1/misc/compress-pdf',
    buildFormData: (file: File, parameters: CompressParameters) => {
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
    },
    filePrefix: 'compressed_'
  });

  return toolOperation;
};