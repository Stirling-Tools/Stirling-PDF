import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface ExtractPagesParameters extends BaseParameters {
  pageNumbers: string;
}

export const defaultParameters: ExtractPagesParameters = {
  pageNumbers: "",
};

export type ExtractPagesParametersHook =
  BaseParametersHook<ExtractPagesParameters>;

export const useExtractPagesParameters = (): ExtractPagesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "rearrange-pages",
    validateFn: (p) => (p.pageNumbers || "").trim().length > 0,
  });
};
