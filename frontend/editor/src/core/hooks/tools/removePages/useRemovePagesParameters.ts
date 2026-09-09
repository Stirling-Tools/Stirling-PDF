import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";
import { validatePageNumbers } from "@app/utils/pageSelection";

export interface RemovePagesParameters extends BaseParameters {
  pageNumbers: string; // comma-separated page numbers or ranges (e.g., "1,3,5-8")
}

export const defaultParameters: RemovePagesParameters = {
  pageNumbers: "",
};

export type RemovePagesParametersHook =
  BaseParametersHook<RemovePagesParameters>;

/** Whether these parameters are complete enough to run. Shared by the tool's settings hook
 * and its operationConfig, so the editor and the pipeline builder agree. */
export function validateRemovePagesParameters(
  params: RemovePagesParameters,
): boolean {
  return validatePageNumbers(params.pageNumbers);
}

export const useRemovePagesParameters = (): RemovePagesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "remove-pages",
    validateFn: validateRemovePagesParameters,
  });
};
