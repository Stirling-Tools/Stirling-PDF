import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRemovePasswordParameters, defaultParameters } from '@app/hooks/tools/removePassword/useRemovePasswordParameters';
import { PreferencesTestWrapper } from '@testing/preferencesTestWrapper';

const renderRemovePasswordHook = () => renderHook(() => useRemovePasswordParameters(), { wrapper: PreferencesTestWrapper });

describe('useRemovePasswordParameters', () => {
  test('should initialize with default parameters', () => {
    const { result } = renderRemovePasswordHook();

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should update password parameter', () => {
    const { result } = renderRemovePasswordHook();

    act(() => {
      result.current.updateParameter('password', 'test-password');
    });

    expect(result.current.parameters.password).toBe('test-password');
  });

  test('should reset parameters to defaults', () => {
    const { result } = renderRemovePasswordHook();

    // First, change the password
    act(() => {
      result.current.updateParameter('password', 'test-password');
    });

    expect(result.current.parameters.password).toBe('test-password');

    // Then reset
    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });

  test('should return correct endpoint name', () => {
    const { result } = renderRemovePasswordHook();

    expect(result.current.getEndpointName()).toBe('remove-password');
  });

  test.each([
    {
      description: 'with valid password',
      password: 'valid-password',
      expectedValid: true
    },
    {
      description: 'with empty password',
      password: '',
      expectedValid: false
    },
    {
      description: 'with whitespace only password',
      password: '   \t   ',
      expectedValid: true
    },
    {
      description: 'with password containing special characters',
      password: 'p@ssw0rd!',
      expectedValid: true
    },
    {
      description: 'with single character password',
      password: 'a',
      expectedValid: true
    }
  ])('should validate parameters correctly $description', ({ password, expectedValid }) => {
    const { result } = renderRemovePasswordHook();

    act(() => {
      result.current.updateParameter('password', password);
    });

    expect(result.current.validateParameters()).toBe(expectedValid);
  });
});
