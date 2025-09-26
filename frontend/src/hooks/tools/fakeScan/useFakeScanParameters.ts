import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface FakeScanParameters extends BaseParameters {
  quality: 'low' | 'medium' | 'high';
  rotation: 'none' | 'slight' | 'moderate' | 'severe';
  advancedEnabled: boolean;
  colorspace: 'grayscale' | 'color';
  border: number;
  rotate: number;
  rotateVariance: number;
  brightness: number;
  contrast: number;
  blur: number;
  noise: number;
  yellowish: boolean;
  resolution: number;
}

export const defaultParameters: FakeScanParameters = {
  quality: 'high',
  rotation: 'slight',
  advancedEnabled: false,
  colorspace: 'grayscale',
  border: 20,
  rotate: 0,
  rotateVariance: 2,
  brightness: 1.0,
  contrast: 1.0,
  blur: 1.0,
  noise: 8.0,
  yellowish: false,
  resolution: 300,
};

export type FakeScanParametersHook = BaseParametersHook<FakeScanParameters>;

export const useFakeScanParameters = (): FakeScanParametersHook => {
  return useBaseParameters<FakeScanParameters>({
    defaultParameters,
    endpointName: 'scanner-effect',
  });
};


