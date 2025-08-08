import { useState, useCallback } from 'react';

export interface SanitizeParameters {
  removeJavaScript: boolean;
  removeEmbeddedFiles: boolean;
  removeXMPMetadata: boolean;
  removeMetadata: boolean;
  removeLinks: boolean;
  removeFonts: boolean;
}

export const defaultParameters: SanitizeParameters = {
  removeJavaScript: true,
  removeEmbeddedFiles: true,
  removeXMPMetadata: false,
  removeMetadata: false,
  removeLinks: false,
  removeFonts: false,
};

export const useSanitizeParameters = () => {
  const [parameters, setParameters] = useState<SanitizeParameters>(defaultParameters);

  const updateParameter = useCallback(<K extends keyof SanitizeParameters>(
    key: K,
    value: SanitizeParameters[K]
  ) => {
    setParameters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const resetParameters = useCallback(() => {
    setParameters(defaultParameters);
  }, []);

  const getEndpointName = () => {
    return 'sanitize-pdf'
  };

  const validateParameters = useCallback(() => {
    // At least one sanitization option must be selected
    return Object.values(parameters).some(value => value === true);
  }, [parameters]);

  return {
    parameters,
    updateParameter,
    resetParameters,
    getEndpointName,
    validateParameters,
  };
};
