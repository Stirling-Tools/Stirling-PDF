import { ChangePermissionsParameters, ChangePermissionsParametersHook, useChangePermissionsParameters } from '@app/hooks/tools/changePermissions/useChangePermissionsParameters';
import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

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
  password: '',
  ownerPassword: '',
  keyLength: 128,
};

export const useAddPasswordParameters = (): AddPasswordParametersHook => {
  const permissions = useChangePermissionsParameters();

  const baseHook = useBaseParameters({
    defaultParameters,
    endpointName: 'add-password',
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
