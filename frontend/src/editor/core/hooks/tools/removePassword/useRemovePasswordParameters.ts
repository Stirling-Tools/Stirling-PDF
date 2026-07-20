import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface RemovePasswordParameters extends BaseParameters {
  password: string;
}

export type RemovePasswordParametersHook =
  BaseParametersHook<RemovePasswordParameters>;

export const defaultParameters: RemovePasswordParameters = {
  password: "",
};

export const useRemovePasswordParameters = (): RemovePasswordParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "remove-password",
    validateFn: (params) => {
      return params.password !== "";
    },
  });
};
