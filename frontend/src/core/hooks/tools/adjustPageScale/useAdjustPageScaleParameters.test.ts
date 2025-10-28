import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdjustPageScaleParameters, defaultParameters, PageSize, AdjustPageScaleParametersHook } from '@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters';

describe('useAdjustPageScaleParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useAdjustPageScaleParameters());

    expect(result.current.parameters).toStrictEqual(defaultParameters);
    expect(result.current.parameters.scaleFactor).toBe(1.0);
    expect(result.current.parameters.pageSize).toBe(PageSize.KEEP);
  });

  test.each([
    { paramName: 'scaleFactor' as const, value: 0.5 },
    { paramName: 'scaleFactor' as const, value: 2.0 },
    { paramName: 'scaleFactor' as const, value: 10.0 },
    { paramName: 'pageSize' as const, value: PageSize.A4 },
    { paramName: 'pageSize' as const, value: PageSize.LETTER },
    { paramName: 'pageSize' as const, value: PageSize.LEGAL },
  ])('should update parameter $paramName to $value', ({ paramName, value }) => {
    const { result } = renderHook(() => useAdjustPageScaleParameters());

    act(() => {
      result.current.updateParameter(paramName, value);
    });

    expect(result.current.parameters[paramName]).toBe(value);
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderHook(() => useAdjustPageScaleParameters());

    // First, change some parameters
    act(() => {
      result.current.updateParameter('scaleFactor', 2.5);
      result.current.updateParameter('pageSize', PageSize.A3);
    });

    expect(result.current.parameters.scaleFactor).toBe(2.5);
    expect(result.current.parameters.pageSize).toBe(PageSize.A3);

    // Then reset
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should return correct endpoint name', () => {
    const { result } = renderHook(() => useAdjustPageScaleParameters());

    expect(result.current.getEndpointName()).toBe('scale-pages');
  });

  test.each([
    {
      description: 'with default parameters',
      setup: () => {},
      expected: true
    },
    {
      description: 'with valid scale factor 0.1',
      setup: (hook: AdjustPageScaleParametersHook) => {
        hook.updateParameter('scaleFactor', 0.1);
      },
      expected: true
    },
    {
      description: 'with valid scale factor 10.0',
      setup: (hook: AdjustPageScaleParametersHook) => {
        hook.updateParameter('scaleFactor', 10.0);
      },
      expected: true
    },
    {
      description: 'with A4 page size',
      setup: (hook: AdjustPageScaleParametersHook) => {
        hook.updateParameter('pageSize', PageSize.A4);
      },
      expected: true
    },
    {
      description: 'with invalid scale factor 0',
      setup: (hook: AdjustPageScaleParametersHook) => {
        hook.updateParameter('scaleFactor', 0);
      },
      expected: false
    },
    {
      description: 'with negative scale factor',
      setup: (hook: AdjustPageScaleParametersHook) => {
        hook.updateParameter('scaleFactor', -0.5);
      },
      expected: false
    }
  ])('should validate parameters correctly $description', ({ setup, expected }) => {
    const { result } = renderHook(() => useAdjustPageScaleParameters());

    act(() => {
      setup(result.current);
    });

    expect(result.current.validateParameters()).toBe(expected);
  });

  test('should handle all PageSize enum values', () => {
    const { result } = renderHook(() => useAdjustPageScaleParameters());

    Object.values(PageSize).forEach(pageSize => {
      act(() => {
        result.current.updateParameter('pageSize', pageSize);
      });

      expect(result.current.parameters.pageSize).toBe(pageSize);
      expect(result.current.validateParameters()).toBe(true);
    });
  });

  test('should handle scale factor edge cases', () => {
    const { result } = renderHook(() => useAdjustPageScaleParameters());

    // Test very small valid scale factor
    act(() => {
      result.current.updateParameter('scaleFactor', 0.01);
    });
    expect(result.current.validateParameters()).toBe(true);

    // Test scale factor just above zero
    act(() => {
      result.current.updateParameter('scaleFactor', 0.001);
    });
    expect(result.current.validateParameters()).toBe(true);

    // Test exactly zero (invalid)
    act(() => {
      result.current.updateParameter('scaleFactor', 0);
    });
    expect(result.current.validateParameters()).toBe(false);
  });
});
