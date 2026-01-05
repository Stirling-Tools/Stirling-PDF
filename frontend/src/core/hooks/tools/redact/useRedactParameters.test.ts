import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRedactParameters, defaultParameters } from '@app/hooks/tools/redact/useRedactParameters';

describe('useRedactParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderHook(() => useRedactParameters());

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test.each([
    { paramName: 'mode' as const, value: 'manual' as const },
    { paramName: 'wordsToRedact' as const, value: ['word1', 'word2'] },
    { paramName: 'useRegex' as const, value: true },
    { paramName: 'wholeWordSearch' as const, value: true },
    { paramName: 'redactColor' as const, value: '#FF0000' },
    { paramName: 'customPadding' as const, value: 0.5 },
    { paramName: 'convertPDFToImage' as const, value: false }
  ])('should update parameter $paramName', ({ paramName, value }) => {
    const { result } = renderHook(() => useRedactParameters());

    act(() => {
      result.current.updateParameter(paramName, value);
    });

    expect(result.current.parameters[paramName]).toStrictEqual(value);
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderHook(() => useRedactParameters());

    // Modify some parameters
    act(() => {
      result.current.updateParameter('mode', 'manual');
      result.current.updateParameter('wordsToRedact', ['test']);
      result.current.updateParameter('useRegex', true);
    });

    // Reset parameters
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  describe('validation', () => {
    test.each([
      { description: 'validate when wordsToRedact has non-empty words in automatic mode', wordsToRedact: ['word1', 'word2'], expected: true },
      { description: 'not validate when wordsToRedact is empty in automatic mode', wordsToRedact: [], expected: false },
      { description: 'not validate when wordsToRedact contains only empty strings in automatic mode', wordsToRedact: ['', '  ', ''], expected: false },
      { description: 'validate when wordsToRedact contains at least one non-empty word in automatic mode', wordsToRedact: ['', 'valid', '  '], expected: true },
    ])('should $description', ({ wordsToRedact, expected }) => {
      const { result } = renderHook(() => useRedactParameters());

      act(() => {
        result.current.updateParameter('mode', 'automatic');
        result.current.updateParameter('wordsToRedact', wordsToRedact);
      });

      expect(result.current.validateParameters()).toBe(expected);
    });

    test('should not validate in manual mode (not implemented)', () => {
      const { result } = renderHook(() => useRedactParameters());

      act(() => {
        result.current.updateParameter('mode', 'manual');
      });

      expect(result.current.validateParameters()).toBe(false);
    });
  });

  describe('endpoint handling', () => {
    test('should return correct endpoint for automatic mode', () => {
      const { result } = renderHook(() => useRedactParameters());

      act(() => {
        result.current.updateParameter('mode', 'automatic');
      });

      expect(result.current.getEndpointName()).toBe('/api/v1/security/auto-redact');
    });

    test('should return empty endpoint for manual mode (handled client-side)', () => {
      const { result } = renderHook(() => useRedactParameters());

      act(() => {
        result.current.updateParameter('mode', 'manual');
      });

      expect(result.current.getEndpointName()).toBe('');
    });
  });

  test('should maintain parameter state across updates', () => {
    const { result } = renderHook(() => useRedactParameters());

    act(() => {
      result.current.updateParameter('redactColor', '#FF0000');
      result.current.updateParameter('customPadding', 0.5);
      result.current.updateParameter('wordsToRedact', ['word1']);
    });

    // All parameters should be updated
    expect(result.current.parameters.redactColor).toBe('#FF0000');
    expect(result.current.parameters.customPadding).toBe(0.5);
    expect(result.current.parameters.wordsToRedact).toEqual(['word1']);

    // Other parameters should remain at defaults
    expect(result.current.parameters.mode).toBe('automatic');
    expect(result.current.parameters.useRegex).toBe(false);
    expect(result.current.parameters.wholeWordSearch).toBe(false);
    expect(result.current.parameters.convertPDFToImage).toBe(true);
  });

  test('should handle array parameter updates correctly', () => {
    const { result } = renderHook(() => useRedactParameters());

    act(() => {
      result.current.updateParameter('wordsToRedact', ['initial']);
    });

    expect(result.current.parameters.wordsToRedact).toEqual(['initial']);

    act(() => {
      result.current.updateParameter('wordsToRedact', ['updated', 'multiple']);
    });

    expect(result.current.parameters.wordsToRedact).toEqual(['updated', 'multiple']);
  });
});
