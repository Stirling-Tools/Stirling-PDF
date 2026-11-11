import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface RemovePasswordParameters extends BaseParameters {
  password: string;
  ownerPassword?: string;
}

export type RemovePasswordParametersHook =
  BaseParametersHook<RemovePasswordParameters>;

export const defaultParameters: RemovePasswordParameters = {
  password: "",
};

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateRemovePasswordParameters(
  params: RemovePasswordParameters,
): boolean {
  return params.password !== "" || !!params.ownerPassword;
}

export const useRemovePasswordParameters = (): RemovePasswordParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "remove-password",
    validateFn: validateRemovePasswordParameters,
  });
};
