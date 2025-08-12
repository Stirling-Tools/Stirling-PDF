import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAddPasswordParameters, defaultParameters, AddPasswordParameters } from './useAddPasswordParameters';

describe('useAddPasswordParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should update string parameters', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.updateParameter('password', 'test-password');
    });

    expect(result.current.parameters.password).toBe('test-password');

    act(() => {
      result.current.updateParameter('ownerPassword', 'owner-password');
    });

    expect(result.current.parameters.ownerPassword).toBe('owner-password');
  });

  test('should update numeric parameters', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.updateParameter('keyLength', 256);
    });

    expect(result.current.parameters.keyLength).toBe(256);
  });

  test('should update boolean parameters', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.updateParameter('preventAssembly', true);
    });

    expect(result.current.parameters.preventAssembly).toBe(true);

    act(() => {
      result.current.updateParameter('preventPrinting', true);
    });

    expect(result.current.parameters.preventPrinting).toBe(true);
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    // First, change some parameters
    act(() => {
      result.current.updateParameter('password', 'test');
      result.current.updateParameter('keyLength', 256);
      result.current.updateParameter('preventAssembly', true);
    });

    expect(result.current.parameters.password).toBe('test');
    expect(result.current.parameters.keyLength).toBe(256);
    expect(result.current.parameters.preventAssembly).toBe(true);

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

  test('should validate parameters correctly - with passwords', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    // Default state should be invalid (no passwords or restrictions)
    expect(result.current.validateParameters()).toBe(false);

    // Add user password - should be valid
    act(() => {
      result.current.updateParameter('password', 'user-password');
    });

    expect(result.current.validateParameters()).toBe(true);

    // Remove user password, add owner password - should still be valid
    act(() => {
      result.current.updateParameter('password', '');
      result.current.updateParameter('ownerPassword', 'owner-password');
    });

    expect(result.current.validateParameters()).toBe(true);

    // Add both passwords - should be valid
    act(() => {
      result.current.updateParameter('password', 'user-password');
    });

    expect(result.current.validateParameters()).toBe(true);
  });

  test('should validate parameters correctly - with restrictions only', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    // Default state should be invalid
    expect(result.current.validateParameters()).toBe(false);

    // Add one restriction - should be valid
    act(() => {
      result.current.updateParameter('preventAssembly', true);
    });

    expect(result.current.validateParameters()).toBe(true);

    // Add multiple restrictions - should still be valid
    act(() => {
      result.current.updateParameter('preventPrinting', true);
      result.current.updateParameter('preventModify', true);
    });

    expect(result.current.validateParameters()).toBe(true);
  });

  test('should validate parameters correctly - with passwords and restrictions', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    // Add both password and restrictions - should be valid
    act(() => {
      result.current.updateParameter('password', 'test-password');
      result.current.updateParameter('preventAssembly', true);
    });

    expect(result.current.validateParameters()).toBe(true);
  });

  test('should handle whitespace-only passwords as valid', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    // Whitespace-only passwords should be considered valid
    act(() => {
      result.current.updateParameter('password', '   ');
    });

    expect(result.current.validateParameters()).toBe(true);

    act(() => {
      result.current.updateParameter('password', '');
      result.current.updateParameter('ownerPassword', ' \t ');
    });

    expect(result.current.validateParameters()).toBe(true);
  });

  test('should handle all boolean restriction parameters', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    const booleanParams = (Object.keys(defaultParameters) as Array<keyof AddPasswordParameters>)
      .filter((k) => typeof defaultParameters[k] === "boolean");

    // Test each restriction individually makes validation pass
    booleanParams.forEach(param => {
      act(() => {
        result.current.resetParameters();
        result.current.updateParameter(param, true);
      });

      expect(result.current.validateParameters()).toBe(true);
    });
  });

  test('should handle mixed parameter types in updateParameter', () => {
    const { result } = renderHook(() => useAddPasswordParameters());

    act(() => {
      result.current.updateParameter('password', 'test-string');
      result.current.updateParameter('keyLength', 40);
      result.current.updateParameter('preventAssembly', true);
    });

    expect(result.current.parameters.password).toBe('test-string');
    expect(result.current.parameters.keyLength).toBe(40);
    expect(result.current.parameters.preventAssembly).toBe(true);
  });
});
