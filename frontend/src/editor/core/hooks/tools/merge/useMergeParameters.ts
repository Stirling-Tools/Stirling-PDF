import { BaseParameters } from "@editor/types/parameters";
import {
  BaseParametersHook,
  useBaseParameters,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface MergeParameters extends BaseParameters {
  removeDigitalSignature: boolean;
  generateTableOfContents: boolean;
  generateTableOfContentsPage: boolean;
}

export const defaultParameters: MergeParameters = {
  removeDigitalSignature: false,
  generateTableOfContents: false,
  generateTableOfContentsPage: false,
};

export type MergeParametersHook = BaseParametersHook<MergeParameters>;

export const useMergeParameters = (): MergeParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "merge-pdfs",
  });
};
