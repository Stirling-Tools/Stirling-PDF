import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChangePermissionsParameters, defaultParameters, ChangePermissionsParameters } from '@app/hooks/tools/changePermissions/useChangePermissionsParameters';

describe('useChangePermissionsParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useChangePermissionsParameters());

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should update individual boolean parameters', () => {
    const { result } = renderHook(() => useChangePermissionsParameters());

    act(() => {
      result.current.updateParameter('preventAssembly', true);
    });

    expect(result.current.parameters.preventAssembly).toBe(true);
    expect(result.current.parameters.preventPrinting).toBe(false); // Other parameters should remain unchanged

    act(() => {
      result.current.updateParameter('preventPrinting', true);
    });

    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(result.current.parameters.preventAssembly).toBe(true);
  });

  test('should update all permission parameters', () => {
    const { result } = renderHook(() => useChangePermissionsParameters());

    const permissionKeys = Object.keys(defaultParameters) as Array<keyof ChangePermissionsParameters>;

    // Set all to true
    act(() => {
      permissionKeys.forEach(key => {
        result.current.updateParameter(key, true);
      });
    });

    permissionKeys.forEach(key => {
      expect(result.current.parameters[key]).toBe(true);
    });

    // Set all to false
    act(() => {
      permissionKeys.forEach(key => {
        result.current.updateParameter(key, false);
      });
    });

    permissionKeys.forEach(key => {
      expect(result.current.parameters[key]).toBe(false);
    });
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderHook(() => useChangePermissionsParameters());

    // First, change some parameters
    act(() => {
      result.current.updateParameter('preventAssembly', true);
      result.current.updateParameter('preventPrinting', true);
      result.current.updateParameter('preventModify', true);
    });

    expect(result.current.parameters.preventAssembly).toBe(true);
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(result.current.parameters.preventModify).toBe(true);

    // Then reset
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should return correct endpoint name', () => {
    const { result } = renderHook(() => useChangePermissionsParameters());

    expect(result.current.getEndpointName()).toBe('add-password');
  });

  test('should always validate as true', () => {
    const { result } = renderHook(() => useChangePermissionsParameters());

    // Default state should be valid
    expect(result.current.validateParameters()).toBe(true);

    // Set some restrictions - should still be valid
    act(() => {
      result.current.updateParameter('preventAssembly', true);
      result.current.updateParameter('preventPrinting', true);
    });

    expect(result.current.validateParameters()).toBe(true);

    // Set all restrictions - should still be valid
    act(() => {
      const permissionKeys = Object.keys(defaultParameters) as Array<keyof ChangePermissionsParameters>;
      permissionKeys.forEach(key => {
        result.current.updateParameter(key, true);
      });
    });

    expect(result.current.validateParameters()).toBe(true);
  });
});
