import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';
import { useMemo, useCallback } from 'react';

// Normalize angle to valid backend values (0, 90, 180, 270)
export const normalizeAngle = (angle: number): number => {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export interface RotateParameters extends BaseParameters {
  angle: number; // Current rotation angle (0, 90, 180, 270)
}

export const defaultParameters: RotateParameters = {
  angle: 0,
};

export type RotateParametersHook = BaseParametersHook<RotateParameters> & {
  rotateClockwise: () => void;
  rotateAnticlockwise: () => void;
  hasRotation: boolean;
  normalizeAngle: (angle: number) => number;
};

export const useRotateParameters = (): RotateParametersHook => {
  const baseHook = useBaseParameters({
    defaultParameters,
    endpointName: 'rotate-pdf',
    validateFn: (params) => {
      // Angle must be a multiple of 90
      return params.angle % 90 === 0;
    },
  });

  // Rotate clockwise by 90 degrees
  const rotateClockwise = useCallback(() => {
    baseHook.updateParameter('angle', baseHook.parameters.angle + 90);
  }, [baseHook]);

  // Rotate anticlockwise by 90 degrees
  const rotateAnticlockwise = useCallback(() => {
    baseHook.updateParameter('angle', baseHook.parameters.angle - 90);
  }, [baseHook]);

  // Check if rotation will actually change the document
  const hasRotation = useMemo(() => {
    const normalized = normalizeAngle(baseHook.parameters.angle);
    return normalized !== 0;
  }, [baseHook.parameters.angle, normalizeAngle]);

  // Override updateParameter - no longer normalize angles here
  const updateParameter = useCallback(<K extends keyof RotateParameters>(
    parameter: K,
    value: RotateParameters[K]
  ) => {
    baseHook.updateParameter(parameter, value);
  }, [baseHook]);

  return {
    ...baseHook,
    updateParameter,
    rotateClockwise,
    rotateAnticlockwise,
    hasRotation,
    normalizeAngle,
  };
};
