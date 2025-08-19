import { useState, useCallback } from 'react';

export interface BaseParametersHook<T> {
  parameters: T;
  updateParameter: <K extends keyof T>(parameter: K, value: T[K]) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

export interface BaseParametersConfig<T> {
  defaultParameters: T;
  endpointName: string;
  validateFn?: (params: T) => boolean;
}

export function useBaseParameters<T>(config: BaseParametersConfig<T>): BaseParametersHook<T> {
  const [parameters, setParameters] = useState<T>(config.defaultParameters);

  const updateParameter = useCallback(<K extends keyof T>(parameter: K, value: T[K]) => {
    setParameters(prev => ({
      ...prev,
      [parameter]: value,
    }));
  }, []);

  const resetParameters = useCallback(() => {
    setParameters(config.defaultParameters);
  }, [config.defaultParameters]);

  const validateParameters = useCallback(() => {
    return config.validateFn ? config.validateFn(parameters) : true;
  }, [parameters, config.validateFn]);

  const getEndpointName = useCallback(() => {
    return config.endpointName;
  }, [config.endpointName]);

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
}