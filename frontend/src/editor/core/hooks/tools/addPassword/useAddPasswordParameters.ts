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
 * Restrictions require separate credentials so opening the document does not grant owner access.
 */
export function validateAddPasswordParameters(
  params: AddPasswordFullParameters,
): boolean {
  const restricted = Object.entries(params.permissions).some(
    ([key, value]) => key.startsWith("prevent") && value === true,
  );
  return (
    validateChangePermissionsParameters(params.permissions) &&
    (params.password.length > 0 || params.ownerPassword.length > 0) &&
    (!restricted ||
      (params.ownerPassword.length > 0 &&
        params.ownerPassword !== params.password))
  );
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
    validateParameters: () => validateAddPasswordParameters(fullParameters),
    permissions,
    resetParameters,
  };
};
