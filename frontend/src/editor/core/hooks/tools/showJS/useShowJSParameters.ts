import {
  useBaseParameters,
  type BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";
import { BaseParameters } from "@editor/types/parameters";

export interface ShowJSParameters extends BaseParameters {
  // Extends BaseParameters - ready for future parameter additions if needed
}

export const defaultParameters: ShowJSParameters = {
  // No parameters needed
};

export type ShowJSParametersHook = BaseParametersHook<ShowJSParameters>;

export const useShowJSParameters = (): ShowJSParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "show-javascript",
  });
};
