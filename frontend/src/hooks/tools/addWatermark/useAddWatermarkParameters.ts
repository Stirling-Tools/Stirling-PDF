import { useState, useCallback } from 'react';

export interface AddWatermarkParameters {
  watermarkType: 'text' | 'image';
  watermarkText: string;
  watermarkImage?: File;
  fontSize: number;
  rotation: number;
  opacity: number;
  widthSpacer: number;
  heightSpacer: number;
  position: string;
  overrideX?: number;
  overrideY?: number;
}

const defaultParameters: AddWatermarkParameters = {
  watermarkType: 'text',
  watermarkText: '',
  fontSize: 12,
  rotation: 0,
  opacity: 50,
  widthSpacer: 50,
  heightSpacer: 50,
  position: 'center'
};

export const useAddWatermarkParameters = () => {
  const [parameters, setParameters] = useState<AddWatermarkParameters>(defaultParameters);

  const updateParameter = useCallback(<K extends keyof AddWatermarkParameters>(
    key: K,
    value: AddWatermarkParameters[K]
  ) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetParameters = useCallback(() => {
    setParameters(defaultParameters);
  }, []);

  const validateParameters = useCallback((): boolean => {
    if (parameters.watermarkType === 'text') {
      return parameters.watermarkText.trim().length > 0;
    } else {
      return parameters.watermarkImage !== undefined;
    }
  }, [parameters]);

  return {
    parameters,
    updateParameter,
    resetParameters,
    validateParameters
  };
};