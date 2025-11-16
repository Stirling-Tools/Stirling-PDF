import { useState, useCallback, Dispatch, SetStateAction, useRef, useEffect } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { loadToolParameters, saveToolParameters } from '@app/services/toolParameterStorage';

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
  storageKey?: string;
}

export function useBaseParameters<T>(config: BaseParametersConfig<T>): BaseParametersHook<T> {
  const { preferences } = usePreferences();
  const storageKey = config.storageKey ?? (typeof config.endpointName === 'string' ? config.endpointName : undefined);

  const shouldPersist = Boolean(storageKey && preferences.rememberFormInputs);
  const hasHydratedFromStorage = useRef(false);

  const mergeWithDefaults = useCallback((values?: Partial<T>): T => ({
    ...(config.defaultParameters as T),
    ...(values ?? {}),
  }), [config.defaultParameters]);

  const [parameters, setParameters] = useState<T>(() => {
    if (shouldPersist && storageKey) {
      const stored = loadToolParameters<T>(storageKey);
      if (stored) {
        hasHydratedFromStorage.current = true;
        return mergeWithDefaults(stored);
      }
    }
    return mergeWithDefaults();
  });

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

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    if (!preferences.rememberFormInputs) {
      hasHydratedFromStorage.current = false;
      return;
    }

    if (hasHydratedFromStorage.current) {
      return;
    }

    const stored = loadToolParameters<T>(storageKey);
    if (stored) {
      setParameters(mergeWithDefaults(stored));
    }
    hasHydratedFromStorage.current = true;
  }, [mergeWithDefaults, preferences.rememberFormInputs, storageKey]);

  useEffect(() => {
    if (!storageKey || !preferences.rememberFormInputs) {
      return;
    }
    saveToolParameters(storageKey, parameters);
  }, [parameters, preferences.rememberFormInputs, storageKey]);

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
