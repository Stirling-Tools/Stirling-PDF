import { BaseParameters } from '../../../types/parameters';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';
import { useMemo, useCallback } from 'react';

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

  // Normalize angle to valid backend values (0, 90, 180, 270)
  const normalizeAngle = useCallback((angle: number): number => {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }, []);

  // Rotate clockwise by 90 degrees
  const rotateClockwise = useCallback(() => {
    baseHook.updateParameter('angle', normalizeAngle(baseHook.parameters.angle + 90));
  }, [baseHook, normalizeAngle]);

  // Rotate anticlockwise by 90 degrees
  const rotateAnticlockwise = useCallback(() => {
    baseHook.updateParameter('angle', normalizeAngle(baseHook.parameters.angle - 90));
  }, [baseHook, normalizeAngle]);

  // Check if rotation will actually change the document
  const hasRotation = useMemo(() => {
    return baseHook.parameters.angle !== 0;
  }, [baseHook.parameters.angle]);

  // Override updateParameter to normalize angles
  const updateParameter = useCallback(<K extends keyof RotateParameters>(
    parameter: K,
    value: RotateParameters[K]
  ) => {
    if (parameter === 'angle') {
      baseHook.updateParameter(parameter, normalizeAngle(value as number) as RotateParameters[K]);
    } else {
      baseHook.updateParameter(parameter, value);
    }
  }, [baseHook, normalizeAngle]);

  return {
    ...baseHook,
    updateParameter,
    rotateClockwise,
    rotateAnticlockwise,
    hasRotation,
    normalizeAngle,
  };
};
