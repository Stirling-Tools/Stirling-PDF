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

/** Whether these parameters are complete enough to run. Shared by the tool's settings hook
 * and its operationConfig, so the editor and the pipeline builder agree. */
export function validateExtractPagesParameters(
  params: ExtractPagesParameters,
): boolean {
  return (params.pageNumbers || "").trim().length > 0;
}

export const useExtractPagesParameters = (): ExtractPagesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "rearrange-pages",
    validateFn: validateExtractPagesParameters,
  });
};
