import { useBaseParameters } from '@app/hooks/tools/shared/useBaseParameters';

export interface ExtractImagesParameters {
  format: 'png' | 'jpg' | 'gif';
  allowDuplicates: boolean;
}

export const defaultParameters: ExtractImagesParameters = {
  format: 'png',
  allowDuplicates: false,
};

export const useExtractImagesParameters = () => {
  return useBaseParameters<ExtractImagesParameters>({
    defaultParameters,
    endpointName: 'extract-images',
    validateFn: () => true, // All parameters have valid defaults
  });
};