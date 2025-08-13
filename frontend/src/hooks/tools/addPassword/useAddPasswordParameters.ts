import { useState } from 'react';
import { ChangePermissionsParameters, ChangePermissionsParametersHook, useChangePermissionsParameters } from '../changePermissions/useChangePermissionsParameters';

export interface AddPasswordParameters {
  password: string;
  ownerPassword: string;
  keyLength: number;
}

export interface AddPasswordFullParameters extends AddPasswordParameters {
  permissions: ChangePermissionsParameters;
}

export interface AddPasswordParametersHook {
  fullParameters: AddPasswordFullParameters;
  parameters: AddPasswordParameters;
  permissions: ChangePermissionsParametersHook;
  updateParameter: <K extends keyof AddPasswordParameters>(parameter: K, value: AddPasswordParameters[K]) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

export const defaultParameters: AddPasswordParameters = {
  password: '',
  ownerPassword: '',
  keyLength: 128,
};

export const useAddPasswordParameters = (): AddPasswordParametersHook => {
  const [parameters, setParameters] = useState<AddPasswordParameters>(defaultParameters);
  const permissions = useChangePermissionsParameters();
  const fullParameters: AddPasswordFullParameters = {
    ...parameters,
    permissions: permissions.parameters,
  };

  const updateParameter = <K extends keyof AddPasswordParameters>(parameter: K, value: AddPasswordParameters[K]) => {
    setParameters(prev => ({
       ...prev,
       [parameter]: value,
      })
    );
  };

  const resetParameters = () => {
    setParameters(defaultParameters);
    permissions.resetParameters();
  };

  const validateParameters = () => {
    // No required parameters for Add Password. Defer to permissions validation.
    return permissions.validateParameters();
  };

  const getEndpointName = () => {
    return 'add-password';
  };

  return {
    fullParameters,
    parameters,
    permissions,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};
