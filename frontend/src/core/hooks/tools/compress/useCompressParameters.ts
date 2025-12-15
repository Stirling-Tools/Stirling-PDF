import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface CompressParameters extends BaseParameters {
  compressionLevel: number;
  grayscale: boolean;
  lineArt: boolean;
  lineArtThreshold: number;
  lineArtEdgeLevel: 1 | 2 | 3;
  expectedSize: string;
  compressionMethod: 'quality' | 'filesize';
  fileSizeValue: string;
  fileSizeUnit: 'KB' | 'MB';
}

export const defaultParameters: CompressParameters = {
  compressionLevel: 5,
  grayscale: false,
  lineArt: false,
  lineArtThreshold: 50,
  lineArtEdgeLevel: 3,
  expectedSize: '',
  compressionMethod: 'quality',
  fileSizeValue: '',
  fileSizeUnit: 'MB',
};

export type CompressParametersHook = BaseParametersHook<CompressParameters>;

export const useCompressParameters = (): CompressParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: 'compress-pdf',
    validateFn: (params) => {
      // For compression, we only need to validate that compression level is within range
      return params.compressionLevel >= 1 && params.compressionLevel <= 9;
    },
  });
};
