import { BaseParameters } from '@app/types/parameters';
import { BaseParametersHook, useBaseParameters } from '@app/hooks/tools/shared/useBaseParameters';

export interface MergeParameters extends BaseParameters {
  removeDigitalSignature: boolean;
  generateTableOfContents: boolean;
};

export const defaultParameters: MergeParameters = {
  removeDigitalSignature: false,
  generateTableOfContents: false,
};

export type MergeParametersHook = BaseParametersHook<MergeParameters>;

export const useMergeParameters = (): MergeParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "merge-pdfs",
  });
};
