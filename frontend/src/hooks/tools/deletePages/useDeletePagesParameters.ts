import { useState } from 'react';

export interface DeletePagesParameters {
  pageNumbers: string;
}

export interface DeletePagesParametersHook {
  parameters: DeletePagesParameters;
  updateParameter: (parameter: keyof DeletePagesParameters, value: string) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
}

const initialParameters: DeletePagesParameters = {
  pageNumbers: "1"
};

export const useDeletePagesParameters = (): DeletePagesParametersHook => {
  const [parameters, setParameters] = useState<DeletePagesParameters>(initialParameters);

  const updateParameter = (parameter: keyof DeletePagesParameters, value: string) => {
    setParameters(prev => ({ ...prev, [parameter]: value }));
  };

  const resetParameters = () => {
    setParameters(initialParameters);
  };

  const validateParameters = () => {
    return parameters.pageNumbers.trim() !== "";
  };

  const getEndpointName = () => {
    return 'remove-pages';
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
};