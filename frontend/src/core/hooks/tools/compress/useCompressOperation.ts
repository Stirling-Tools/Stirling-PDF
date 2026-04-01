import { useTranslation } from 'react-i18next';
import { OptimizePdfRequest } from '@app/generated/openapi';
import { defineBackendToolMapping, useToolOperation, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { CompressParameters, defaultParameters } from '@app/hooks/tools/compress/useCompressParameters';

type CompressApiParams = Omit<OptimizePdfRequest, 'fileInput' | 'fileId'>;

function parseExpectedOutputSize(expectedOutputSize: string): Pick<CompressParameters, 'fileSizeValue' | 'fileSizeUnit'> {
  const trimmed = expectedOutputSize.trim();
  if (!trimmed) {
    return {
      fileSizeValue: '',
      fileSizeUnit: 'MB',
    };
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(KB|MB)$/i);
  if (!match) {
    throw new Error(`Unsupported expected output size: ${expectedOutputSize}`);
  }

  return {
    fileSizeValue: match[1],
    fileSizeUnit: match[2].toUpperCase() as CompressParameters['fileSizeUnit'],
  };
}

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

  formData.append("grayscale", (parameters.grayscale ?? false).toString());
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
  backendMapping: defineBackendToolMapping<CompressParameters, 'optimizePdf', CompressApiParams>({
    operationId: 'optimizePdf',
    toFrontendParameters: (apiParams: CompressApiParams): CompressParameters => {
      const usesFileSizeTarget = apiParams.expectedOutputSize.trim().length > 0;
      const fileSizeFields = parseExpectedOutputSize(apiParams.expectedOutputSize);

      return {
        ...defaultParameters,
        compressionLevel: apiParams.optimizeLevel,
        grayscale: apiParams.grayscale,
        lineArt: apiParams.lineArt ?? false,
        lineArtThreshold: apiParams.lineArtThreshold ?? defaultParameters.lineArtThreshold,
        lineArtEdgeLevel: (apiParams.lineArtEdgeLevel ?? defaultParameters.lineArtEdgeLevel) as CompressParameters['lineArtEdgeLevel'],
        linearize: apiParams.linearize,
        compressionMethod: usesFileSizeTarget ? 'filesize' : 'quality',
        expectedSize: apiParams.expectedOutputSize,
        fileSizeValue: fileSizeFields.fileSizeValue,
        fileSizeUnit: fileSizeFields.fileSizeUnit,
      };
    },
    toApiParams: (parameters: CompressParameters): CompressApiParams => ({
      optimizeLevel: parameters.compressionLevel as CompressApiParams['optimizeLevel'],
      expectedOutputSize:
        parameters.compressionMethod === 'filesize' && parameters.fileSizeValue
          ? `${parameters.fileSizeValue}${parameters.fileSizeUnit}`
          : '',
      linearize: parameters.linearize,
      normalize: false,
      grayscale: parameters.grayscale,
      lineArt: parameters.lineArt,
      lineArtThreshold: parameters.lineArtThreshold,
      lineArtEdgeLevel: parameters.lineArtEdgeLevel,
    }),
  }),
} as const;

export const useCompressOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CompressParameters>({
    ...compressOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('compress.error.failed', 'An error occurred while compressing the PDF.'))
  });
};
