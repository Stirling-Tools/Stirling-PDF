import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface AdjustContrastParameters {
  contrast: number; // 0-200 (%), 100 = neutral
  brightness: number; // 0-200 (%), 100 = neutral
  saturation: number; // 0-200 (%), 100 = neutral
  red: number; // 0-200 (%), 100 = neutral
  green: number; // 0-200 (%), 100 = neutral
  blue: number; // 0-200 (%), 100 = neutral
}

export const defaultParameters: AdjustContrastParameters = {
  contrast: 100,
  brightness: 100,
  saturation: 100,
  red: 100,
  green: 100,
  blue: 100,
};

export type AdjustContrastParametersHook = BaseParametersHook<AdjustContrastParameters>;

export const useAdjustContrastParameters = (): AdjustContrastParametersHook => {
  return useBaseParameters<AdjustContrastParameters>({
    defaultParameters,
    endpointName: '',
  });
};


