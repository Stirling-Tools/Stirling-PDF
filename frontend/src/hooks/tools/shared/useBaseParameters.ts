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

  const endpointName = config.endpointName;
  let getEndpointName: () => string;
  if (typeof endpointName === "string") {
    getEndpointName = useCallback(() => {
      return endpointName;
    }, []);
  } else {
    getEndpointName = useCallback(() => {
      return endpointName(parameters);
    }, [parameters]);
  }

  return {
    parameters,
    setParameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
}
