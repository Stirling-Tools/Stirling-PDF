import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMergeParameters, defaultParameters } from '@app/hooks/tools/merge/useMergeParameters';
import { PreferencesTestWrapper } from '@testing/preferencesTestWrapper';

const renderMergeHook = () => renderHook(() => useMergeParameters(), { wrapper: PreferencesTestWrapper });

describe('useMergeParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderMergeHook();

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test.each([
    { paramName: 'removeDigitalSignature' as const, value: true },
    { paramName: 'removeDigitalSignature' as const, value: false },
    { paramName: 'generateTableOfContents' as const, value: true },
    { paramName: 'generateTableOfContents' as const, value: false }
  ])('should update parameter $paramName to $value', ({ paramName, value }) => {
    const { result } = renderMergeHook();

    act(() => {
      result.current.updateParameter(paramName, value);
    });

    expect(result.current.parameters[paramName]).toBe(value);
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderMergeHook();

    // First, change some parameters
    act(() => {
      result.current.updateParameter('removeDigitalSignature', true);
      result.current.updateParameter('generateTableOfContents', true);
    });

    expect(result.current.parameters.removeDigitalSignature).toBe(true);
    expect(result.current.parameters.generateTableOfContents).toBe(true);

    // Then reset
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should validate parameters correctly - always returns true', () => {
    const { result } = renderMergeHook();

    // Default state should be valid
    expect(result.current.validateParameters()).toBe(true);

    // Change parameters and validate again
    act(() => {
      result.current.updateParameter('removeDigitalSignature', true);
      result.current.updateParameter('generateTableOfContents', true);
    });

    expect(result.current.validateParameters()).toBe(true);

    // Reset and validate again
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.validateParameters()).toBe(true);
  });
});
