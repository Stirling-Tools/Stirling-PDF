import { useState } from 'react';

export interface ReorganizePagesParameters {
  customMode: string; // empty string means custom order using pageNumbers
  pageNumbers: string; // e.g. "1,3,2,4-6"
}

export const defaultReorganizePagesParameters: ReorganizePagesParameters = {
  customMode: '',
  pageNumbers: '',
};

export const useReorganizePagesParameters = () => {
  const [parameters, setParameters] = useState<ReorganizePagesParameters>(defaultReorganizePagesParameters);

  const updateParameter = <K extends keyof ReorganizePagesParameters>(
    key: K,
    value: ReorganizePagesParameters[K]
  ) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  const resetParameters = () => setParameters(defaultReorganizePagesParameters);

  // If customMode is '' (custom) or 'DUPLICATE', a page order is required; otherwise it's optional/ignored
  const validateParameters = (): boolean => {
    const requiresOrder = parameters.customMode === '' || parameters.customMode === 'DUPLICATE';
    return requiresOrder ? parameters.pageNumbers.trim().length > 0 : true;
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters,
  };
};


