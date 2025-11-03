import { useState } from 'react';

export interface AddAttachmentsParameters {
  attachments: File[];
}

const defaultParameters: AddAttachmentsParameters = {
  attachments: []
};

export const useAddAttachmentsParameters = () => {
  const [parameters, setParameters] = useState<AddAttachmentsParameters>(defaultParameters);

  const updateParameter = <K extends keyof AddAttachmentsParameters>(
    key: K,
    value: AddAttachmentsParameters[K]
  ) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  const resetParameters = () => {
    setParameters(defaultParameters);
  };

  const validateParameters = (): boolean => {
    return parameters.attachments.length > 0;
  };

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters
  };
};
