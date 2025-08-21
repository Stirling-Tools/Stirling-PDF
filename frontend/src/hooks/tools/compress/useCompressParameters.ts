import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface CompressParameters extends BaseParameters {
  compressionLevel: number;
  grayscale: boolean;
  expectedSize: string;
  compressionMethod: 'quality' | 'filesize';
  fileSizeValue: string;
  fileSizeUnit: 'KB' | 'MB';
}

const defaultParameters: CompressParameters = {
  compressionLevel: 5,
  grayscale: false,
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
