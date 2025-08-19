import { useState, useCallback } from 'react';

export interface MergeParameters {
  mergeOrder: 'orderProvided' | 'byFileName' | 'byDateModified' | 'byDateCreated' | 'byPDFTitle';
  removeDigitalSignature: boolean;
  generateTableOfContents: boolean;
}

export const defaultMergeParameters: MergeParameters = {
  mergeOrder: 'orderProvided',
  removeDigitalSignature: false,
  generateTableOfContents: false,
};

export const useMergeParameters = () => {
  const [parameters, setParameters] = useState<MergeParameters>(defaultMergeParameters);

  const updateParameter = useCallback(<K extends keyof MergeParameters>(
    key: K,
    value: MergeParameters[K]
  ) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  }, []);

  const validateParameters = useCallback((): boolean => {
    return true; // Merge has no required parameters
  }, []);

  const resetParameters = useCallback(() => {
    setParameters(defaultMergeParameters);
  }, []);

  return {
    parameters,
    updateParameter,
    validateParameters,
    resetParameters,
  };
};
