import { useState } from 'react';

export interface ChangePermissionsParameters {
  preventAssembly: boolean;
  preventExtractContent: boolean;
  preventExtractForAccessibility: boolean;
  preventFillInForm: boolean;
  preventModify: boolean;
  preventModifyAnnotations: boolean;
  preventPrinting: boolean;
  preventPrintingFaithful: boolean;
}

export interface ChangePermissionsParametersHook {
  parameters: ChangePermissionsParameters;
  updateParameter: (parameter: keyof ChangePermissionsParameters, value: boolean) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
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

export const useChangePermissionsParameters = (): ChangePermissionsParametersHook => {
  const [parameters, setParameters] = useState<ChangePermissionsParameters>(defaultParameters);

  const updateParameter = <K extends keyof ChangePermissionsParameters>(parameter: K, value: ChangePermissionsParameters[K]) => {
    setParameters(prev => ({
       ...prev,
       [parameter]: value,
      })
    );
  };

  const resetParameters = () => {
    setParameters(defaultParameters);
  };

  const validateParameters = () => {
    // Always valid - any combination of permissions is allowed
    return true;
  };

  const getEndpointName = () => {
    return 'add-password'; // Change Permissions is a fake endpoint for the Add Password tool
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};
