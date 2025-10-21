import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRotateParameters, defaultParameters, normalizeAngle } from '@app/hooks/tools/rotate/useRotateParameters';

describe('useRotateParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useRotateParameters());

    expect(result.current.parameters).toEqual(defaultParameters);
    expect(result.current.parameters.angle).toBe(0);
    expect(result.current.hasRotation).toBe(false);
  });

  test('should validate parameters correctly', () => {
    const { result } = renderHook(() => useRotateParameters());

    // Default should be valid
    expect(result.current.validateParameters()).toBe(true);

    // Set invalid angle
    act(() => {
      result.current.updateParameter('angle', 45);
    });
    expect(result.current.validateParameters()).toBe(false);

    // Set valid angle
    act(() => {
      result.current.updateParameter('angle', 90);
    });
    expect(result.current.validateParameters()).toBe(true);
  });

  test('should rotate clockwise correctly', () => {
    const { result } = renderHook(() => useRotateParameters());

    act(() => {
      result.current.rotateClockwise();
    });
    expect(result.current.parameters.angle).toBe(90);
    expect(result.current.hasRotation).toBe(true);

    act(() => {
      result.current.rotateClockwise();
    });
    expect(result.current.parameters.angle).toBe(180);

    act(() => {
      result.current.rotateClockwise();
    });
    expect(result.current.parameters.angle).toBe(270);

    act(() => {
      result.current.rotateClockwise();
    });
    expect(result.current.parameters.angle).toBe(360);
    expect(normalizeAngle(result.current.parameters.angle)).toBe(0);
    expect(result.current.hasRotation).toBe(false);
  });

  test('should rotate anticlockwise correctly', () => {
    const { result } = renderHook(() => useRotateParameters());

    act(() => {
      result.current.rotateAnticlockwise();
    });
    expect(result.current.parameters.angle).toBe(-90);
    expect(result.current.hasRotation).toBe(true);

    act(() => {
      result.current.rotateAnticlockwise();
    });
    expect(result.current.parameters.angle).toBe(-180);

    act(() => {
      result.current.rotateAnticlockwise();
    });
    expect(result.current.parameters.angle).toBe(-270);

    act(() => {
      result.current.rotateAnticlockwise();
    });
    expect(result.current.parameters.angle).toBe(-360);
    expect(normalizeAngle(result.current.parameters.angle)).toBe(0);
    expect(result.current.hasRotation).toBe(false);
  });

  test('should normalize angles correctly', () => {
    const { result } = renderHook(() => useRotateParameters());

    expect(result.current.normalizeAngle(360)).toBe(0);
    expect(result.current.normalizeAngle(450)).toBe(90);
    expect(result.current.normalizeAngle(-90)).toBe(270);
    expect(result.current.normalizeAngle(-180)).toBe(180);
  });

  test('should reset parameters correctly', () => {
    const { result } = renderHook(() => useRotateParameters());

    // Set some rotation
    act(() => {
      result.current.rotateClockwise();
    });
    expect(result.current.parameters.angle).toBe(90);

    act(() => {
      result.current.rotateClockwise();
    });
    expect(result.current.parameters.angle).toBe(180);

    // Reset
    act(() => {
      result.current.resetParameters();
    });
    expect(result.current.parameters).toEqual(defaultParameters);
    expect(result.current.hasRotation).toBe(false);
  });

  test('should update parameters', () => {
    const { result } = renderHook(() => useRotateParameters());

    act(() => {
      result.current.updateParameter('angle', 450);
    });
    expect(result.current.parameters.angle).toBe(450);
    expect(normalizeAngle(result.current.parameters.angle)).toBe(90);

    act(() => {
      result.current.updateParameter('angle', -90);
    });
    expect(result.current.parameters.angle).toBe(-90);
    expect(normalizeAngle(result.current.parameters.angle)).toBe(270);
  });

  test('should return correct endpoint name', () => {
    const { result } = renderHook(() => useRotateParameters());

    expect(result.current.getEndpointName()).toBe('rotate-pdf');
  });

  test('should detect rotation state correctly', () => {
    const { result } = renderHook(() => useRotateParameters());

    // Initially no rotation
    expect(result.current.hasRotation).toBe(false);

    // After rotation
    act(() => {
      result.current.rotateClockwise();
    });
    expect(result.current.hasRotation).toBe(true);

    // After full rotation (360 degrees) - 3 more clicks to complete 360°
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.rotateClockwise();
      });
    }
    expect(result.current.hasRotation).toBe(false);
  });
});
