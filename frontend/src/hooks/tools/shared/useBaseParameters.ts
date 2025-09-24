import { useState, useCallback, Dispatch, SetStateAction } from 'react';

export interface BaseParametersHook<T> {
  parameters: T;
  setParameters: Dispatch<SetStateAction<T>>;
  updateParameter: <K extends keyof T>(parameter: K, value: T[K]) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

export interface BaseParametersConfig<T> {
  defaultParameters: T;
  endpointName: string | ((params: T) => string);
  validateFn?: (params: T) => boolean;
}

export function useBaseParameters<T>({
  defaultParameters,
  endpointName,
  validateFn
}: BaseParametersConfig<T>): BaseParametersHook<T> {
  const [parameters, setParameters] = useState<T>(defaultParameters);

  const updateParameter = useCallback(<K extends keyof T>(parameter: K, value: T[K]) => {
    setParameters(prev => ({
      ...prev,
      [parameter]: value,
    }));
  }, []);

  const resetParameters = useCallback(() => {
    setParameters(defaultParameters);
  }, [defaultParameters]);

  const validateParameters = useCallback(() => {
    return validateFn ? validateFn(parameters) : true;
  }, [parameters, validateFn]);
  const getEndpointName = useCallback(() => {
    if (typeof endpointName === "string") {
      return endpointName;
    } else {
      return endpointName(parameters);
    }
  }, [endpointName, parameters]);

  return {
    parameters,
    setParameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
}
