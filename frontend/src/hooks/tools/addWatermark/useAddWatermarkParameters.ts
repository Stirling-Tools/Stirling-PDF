import { useState, useCallback } from 'react';
import { defaultWatermarkParameters } from '../../../constants/addWatermarkConstants';

export interface AddWatermarkParameters {
  watermarkType?: 'text' | 'image';
  watermarkText: string;
  watermarkImage?: File;
  fontSize: number; // Used for both text size and image size
  rotation: number;
  opacity: number;
  widthSpacer: number;
  heightSpacer: number;
  alphabet: string;
  customColor: string;
  convertPDFToImage: boolean;
}


export const useAddWatermarkParameters = () => {
  const [parameters, setParameters] = useState<AddWatermarkParameters>(defaultWatermarkParameters);

  const updateParameter = useCallback(<K extends keyof AddWatermarkParameters>(
    key: K,
    value: AddWatermarkParameters[K]
  ) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetParameters = useCallback(() => {
    setParameters(defaultWatermarkParameters);
  }, []);

  const validateParameters = useCallback((): boolean => {
    if (!parameters.watermarkType) {
      return false;
    }
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