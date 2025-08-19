import { useState, useCallback } from 'react';

export interface RepairParameters {
  // No parameters needed for repair - it simply attempts to fix corruption
}

export interface RepairParametersHook {
  parameters: RepairParameters;
  updateParameter: <K extends keyof RepairParameters>(parameter: K, value: RepairParameters[K]) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

export const defaultParameters: RepairParameters = {
  // No parameters needed
};

export const useRepairParameters = (): RepairParametersHook => {
  const [parameters, setParameters] = useState<RepairParameters>(defaultParameters);

  const updateParameter = useCallback(<K extends keyof RepairParameters>(parameter: K, value: RepairParameters[K]) => {
    setParameters(prev => ({
       ...prev,
       [parameter]: value,
      })
    );
  }, []);

  const resetParameters = useCallback(() => {
    setParameters(defaultParameters);
  }, []);

  const validateParameters = useCallback(() => {
    return true; // No parameters to validate
  }, []);

  const getEndpointName = () => {
    return 'repair';
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};