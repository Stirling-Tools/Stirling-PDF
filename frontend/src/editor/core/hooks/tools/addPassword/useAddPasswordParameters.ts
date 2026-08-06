import {
  ChangePermissionsParameters,
  ChangePermissionsParametersHook,
  useChangePermissionsParameters,
  validateChangePermissionsParameters,
} from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";
import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface AddPasswordParameters extends BaseParameters {
  password: string;
  ownerPassword: string;
  keyLength: number;
}

export interface AddPasswordFullParameters extends AddPasswordParameters {
  permissions: ChangePermissionsParameters;
}

export interface AddPasswordParametersHook extends BaseParametersHook<AddPasswordParameters> {
  fullParameters: AddPasswordFullParameters;
  permissions: ChangePermissionsParametersHook;
}

export const defaultParameters: AddPasswordParameters = {
  password: "",
  ownerPassword: "",
  keyLength: 128,
};

/**
 * Whether these parameters are complete enough to run.
 * Add Password requires nothing of its own, so delegate to Change Permissions.
 */
export function validateAddPasswordParameters(
  params: AddPasswordFullParameters,
): boolean {
  return validateChangePermissionsParameters(params.permissions);
}

export const useAddPasswordParameters = (): AddPasswordParametersHook => {
  const permissions = useChangePermissionsParameters();

  const baseHook = useBaseParameters({
    defaultParameters,
    endpointName: "add-password",
    validateFn: () => {
      // No required parameters for Add Password. Defer to permissions validation.
      return permissions.validateParameters();
    },
  });

  const fullParameters: AddPasswordFullParameters = {
    ...baseHook.parameters,
    permissions: permissions.parameters,
  };

  const resetParameters = () => {
    baseHook.resetParameters();
    permissions.resetParameters();
  };

  return {
    ...baseHook,
    fullParameters,
    permissions,
    resetParameters,
  };
};
