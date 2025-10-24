import { BaseParameters, ToggleableProcessingParameters } from '../../../types/parameters';
import { BaseParametersHook, useBaseParameters } from '../shared/useBaseParameters';

export interface MergeParameters extends BaseParameters, ToggleableProcessingParameters {
  removeDigitalSignature: boolean;
  generateTableOfContents: boolean;
};

export const defaultParameters: MergeParameters = {
  removeDigitalSignature: false,
  generateTableOfContents: false,
  processingMode: 'backend',
};

export type MergeParametersHook = BaseParametersHook<MergeParameters>;

export const useMergeParameters = (): MergeParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: (params) => (params.processingMode === 'frontend' ? '' : 'merge-pdfs'),
  });
};
