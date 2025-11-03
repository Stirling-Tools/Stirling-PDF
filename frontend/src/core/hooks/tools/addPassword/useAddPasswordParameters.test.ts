import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAddPasswordParameters, defaultParameters, AddPasswordParametersHook } from '@app/hooks/tools/addPassword/useAddPasswordParameters';
import { defaultParameters as defaultChangePermissionsParameters, ChangePermissionsParameters } from '@app/hooks/tools/changePermissions/useChangePermissionsParameters';

describe('useAddPasswordParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test.each([
    { paramName: 'password' as const, value: 'test-password' },
    { paramName: 'ownerPassword' as const, value: 'owner-password' },
    { paramName: 'keyLength' as const, value: 256 }
  ])('should update parameter $paramName', ({ paramName, value }) => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.updateParameter(paramName, value);
    });

    expect(result.current.parameters[paramName]).toBe(value);
  });

  test.each([
    { paramName: 'preventAssembly' as const },
    { paramName: 'preventPrinting' as const }
  ])('should update boolean permission parameter $paramName', ({ paramName }) => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.permissions.updateParameter(paramName, true);
    });

    expect(result.current.permissions.parameters[paramName]).toBe(true);
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    // First, change some parameters
    act(() => {
      result.current.updateParameter('password', 'test');
      result.current.updateParameter('keyLength', 256);
      result.current.permissions.updateParameter('preventAssembly', true);
    });

    expect(result.current.parameters.password).toBe('test');
    expect(result.current.parameters.keyLength).toBe(256);
    expect(result.current.permissions.parameters.preventAssembly).toBe(true);

    // Then reset
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should return correct endpoint name', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    expect(result.current.getEndpointName()).toBe('add-password');
  });

  test.each([
    {
      description: 'with user password only',
      setup: (hook: AddPasswordParametersHook) => {
        hook.updateParameter('password', 'user-password');
      }
    },
    {
      description: 'with owner password only',
      setup: (hook: AddPasswordParametersHook) => {
        hook.updateParameter('ownerPassword', 'owner-password');
      }
    },
    {
      description: 'with both passwords',
      setup: (hook: AddPasswordParametersHook) => {
        hook.updateParameter('password', 'user-password');
        hook.updateParameter('ownerPassword', 'owner-password');
      }
    },
    {
      description: 'with whitespace only password',
      setup: (hook: AddPasswordParametersHook) => {
        hook.updateParameter('password', '  \t  ');
      }
    },
    {
      description: 'with whitespace only owner password',
      setup: (hook: AddPasswordParametersHook) => {
        hook.updateParameter('ownerPassword', '  \t  ');
      }
    },
    {
      description: 'with restrictions only',
      setup: (hook: AddPasswordParametersHook) => {
        hook.permissions.updateParameter('preventAssembly', true);
        hook.permissions.updateParameter('preventPrinting', true);
      }
    },
    {
      description: 'with passwords and restrictions',
      setup: (hook: AddPasswordParametersHook) => {
        hook.updateParameter('password', 'test-password');
        hook.permissions.updateParameter('preventAssembly', true);
      }
    }
  ])('should validate parameters correctly $description', ({ setup }) => {
    const { result } = renderHook(() => useAddPasswordParameters());

    // Default state should be valid
    expect(result.current.validateParameters()).toBe(true);

    // Apply the test scenario setup
    act(() => {
      setup(result.current);
    });

    expect(result.current.validateParameters()).toBe(true);
  });

  test.each(Object.keys(defaultChangePermissionsParameters) as Array<keyof ChangePermissionsParameters>)('should handle boolean restriction parameter %s', (param) => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.resetParameters();
      result.current.permissions.updateParameter(param, true);
    });

    expect(result.current.validateParameters()).toBe(true);
  });

  test('should handle mixed parameter types in updateParameter', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.updateParameter('password', 'test-string');
      result.current.updateParameter('keyLength', 40);
      result.current.permissions.updateParameter('preventAssembly', true);
    });

    expect(result.current.parameters.password).toBe('test-string');
    expect(result.current.parameters.keyLength).toBe(40);
    expect(result.current.permissions.parameters.preventAssembly).toBe(true);
  });
});
