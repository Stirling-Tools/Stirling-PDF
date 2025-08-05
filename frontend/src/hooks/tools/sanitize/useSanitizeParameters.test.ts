import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSanitizeParameters } from './useSanitizeParameters';

describe('useSanitizeParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useSanitizeParameters());

    expect(result.current.parameters).toEqual({
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: false,
      removeMetadata: false,
      removeLinks: false,
      removeFonts: false,
    });
  });

  test('should update individual parameters', () => {
    const { result } = renderHook(() => useSanitizeParameters());

    act(() => {
      result.current.updateParameter('removeXMPMetadata', true);
    });

    expect(result.current.parameters.removeXMPMetadata).toBe(true);
    expect(result.current.parameters.removeJavaScript).toBe(true); // Other params unchanged
    expect(result.current.parameters.removeLinks).toBe(false); // Other params unchanged
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderHook(() => useSanitizeParameters());

    // First, change some parameters
    act(() => {
      result.current.updateParameter('removeXMPMetadata', true);
      result.current.updateParameter('removeJavaScript', false);
    });

    expect(result.current.parameters.removeXMPMetadata).toBe(true);
    expect(result.current.parameters.removeJavaScript).toBe(false);

    // Then reset
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toEqual({
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: false,
      removeMetadata: false,
      removeLinks: false,
      removeFonts: false,
    });
  });

  test('should return correct endpoint name', () => {
    const { result } = renderHook(() => useSanitizeParameters());

    expect(result.current.getEndpointName()).toBe('sanitize-pdf');
  });

  test('should validate parameters correctly', () => {
    const { result } = renderHook(() => useSanitizeParameters());

    // Default state should be valid (has removeJavaScript and removeEmbeddedFiles enabled)
    expect(result.current.validateParameters()).toBe(true);

    // Turn off all parameters - should be invalid
    act(() => {
      result.current.updateParameter('removeJavaScript', false);
      result.current.updateParameter('removeEmbeddedFiles', false);
    });

    expect(result.current.validateParameters()).toBe(false);

    // Turn on one parameter - should be valid again
    act(() => {
      result.current.updateParameter('removeLinks', true);
    });

    expect(result.current.validateParameters()).toBe(true);
  });

  test('should handle all parameter types correctly', () => {
    const { result } = renderHook(() => useSanitizeParameters());

    const allParameters = [
      'removeJavaScript',
      'removeEmbeddedFiles',
      'removeXMPMetadata',
      'removeMetadata',
      'removeLinks',
      'removeFonts'
    ] as const;

    allParameters.forEach(param => {
      act(() => {
        result.current.updateParameter(param, true);
      });
      expect(result.current.parameters[param]).toBe(true);

      act(() => {
        result.current.updateParameter(param, false);
      });
      expect(result.current.parameters[param]).toBe(false);
    });
  });
});
