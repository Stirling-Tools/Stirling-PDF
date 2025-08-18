import { useState } from 'react';

export interface RemovePasswordParameters {
  password: string;
}

export interface RemovePasswordParametersHook {
  parameters: RemovePasswordParameters;
  updateParameter: <K extends keyof RemovePasswordParameters>(parameter: K, value: RemovePasswordParameters[K]) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

export const defaultParameters: RemovePasswordParameters = {
  password: '',
};

export const useRemovePasswordParameters = (): RemovePasswordParametersHook => {
  const [parameters, setParameters] = useState<RemovePasswordParameters>(defaultParameters);

  const updateParameter = <K extends keyof RemovePasswordParameters>(parameter: K, value: RemovePasswordParameters[K]) => {
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
    return parameters.password !== '';
  };

  const getEndpointName = () => {
    return 'remove-password';
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};
