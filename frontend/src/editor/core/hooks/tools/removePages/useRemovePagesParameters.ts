import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";
import { validatePageNumbers } from "@editor/utils/pageSelection";

export interface RemovePagesParameters extends BaseParameters {
  pageNumbers: string; // comma-separated page numbers or ranges (e.g., "1,3,5-8")
}

export const defaultParameters: RemovePagesParameters = {
  pageNumbers: "",
};

export type RemovePagesParametersHook =
  BaseParametersHook<RemovePagesParameters>;

export const useRemovePagesParameters = (): RemovePagesParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "remove-pages",
    validateFn: (p) => validatePageNumbers(p.pageNumbers),
  });
};
