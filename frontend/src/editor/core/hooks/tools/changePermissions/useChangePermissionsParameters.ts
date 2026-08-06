import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface ChangePermissionsParameters extends BaseParameters {
  preventAssembly: boolean;
  preventExtractContent: boolean;
  preventExtractForAccessibility: boolean;
  preventFillInForm: boolean;
  preventModify: boolean;
  preventModifyAnnotations: boolean;
  preventPrinting: boolean;
  preventPrintingFaithful: boolean;
}

export const defaultParameters: ChangePermissionsParameters = {
  preventAssembly: false,
  preventExtractContent: false,
  preventExtractForAccessibility: false,
  preventFillInForm: false,
  preventModify: false,
  preventModifyAnnotations: false,
  preventPrinting: false,
  preventPrintingFaithful: false,
};

export type ChangePermissionsParametersHook =
  BaseParametersHook<ChangePermissionsParameters>;

/**
 * Whether these permissions are complete enough to run.
 * Every field is a boolean with a default, so today any combination is a valid request.
 */
export function validateChangePermissionsParameters(
  _params: ChangePermissionsParameters,
): boolean {
  return true;
}

export const useChangePermissionsParameters =
  (): ChangePermissionsParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "add-password", // Change Permissions is a fake endpoint for the Add Password tool
      validateFn: validateChangePermissionsParameters,
    });
  };
