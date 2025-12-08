import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { buildRedactFormData, redactOperationConfig, useRedactOperation } from '@app/hooks/tools/redact/useRedactOperation';
import { defaultParameters, RedactParameters } from '@app/hooks/tools/redact/useRedactParameters';

// Mock the useToolOperation hook
vi.mock('../shared/useToolOperation', async () => {
  const actual = await vi.importActual('../shared/useToolOperation');  // Need to keep ToolType etc.
  return {
    ...actual,
    useToolOperation: vi.fn()
  };
});

// Mock the translation hook
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: vi.fn((_key: string, fallback: string) => fallback) })
}));

// Mock the error handler utility
vi.mock('../../../utils/toolErrorHandler', () => ({
  createStandardErrorHandler: vi.fn(() => vi.fn())
}));

describe('buildRedactFormData', () => {
  const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });

  test('should build form data for automatic mode', () => {
    const parameters: RedactParameters = {
      ...defaultParameters,
      mode: 'automatic',
      wordsToRedact: ['Confidential', 'Secret'],
      useRegex: true,
      wholeWordSearch: true,
      redactColor: '#FF0000',
      customPadding: 0.5,
      convertPDFToImage: false,
    };

    const formData = buildRedactFormData(parameters, mockFile);

    expect(formData.get('fileInput')).toBe(mockFile);
    expect(formData.get('listOfText')).toBe('Confidential\nSecret');
    expect(formData.get('useRegex')).toBe('true');
    expect(formData.get('wholeWordSearch')).toBe('true');
    expect(formData.get('redactColor')).toBe('FF0000'); // Hash should be removed
    expect(formData.get('customPadding')).toBe('0.5');
    expect(formData.get('convertPDFToImage')).toBe('false');
  });

  test('should handle empty words array', () => {
    const parameters: RedactParameters = {
      ...defaultParameters,
      mode: 'automatic',
      wordsToRedact: [],
    };

    const formData = buildRedactFormData(parameters, mockFile);

    expect(formData.get('listOfText')).toBe('');
  });

  test('should join multiple words with newlines', () => {
    const parameters: RedactParameters = {
      ...defaultParameters,
      mode: 'automatic',
      wordsToRedact: ['Word1', 'Word2', 'Word3'],
    };

    const formData = buildRedactFormData(parameters, mockFile);

    expect(formData.get('listOfText')).toBe('Word1\nWord2\nWord3');
  });

  test.each([
    { description: 'remove hash from redact color', redactColor: '#123456', expected: '123456' },
    { description: 'handle redact color without hash', redactColor: 'ABCDEF', expected: 'ABCDEF' },
  ])('should $description', ({ redactColor, expected }) => {
    const parameters: RedactParameters = {
      ...defaultParameters,
      mode: 'automatic',
      redactColor,
    };

    const formData = buildRedactFormData(parameters, mockFile);

    expect(formData.get('redactColor')).toBe(expected);
  });

  test('should convert boolean parameters to strings', () => {
    const parameters: RedactParameters = {
      ...defaultParameters,
      mode: 'automatic',
      useRegex: false,
      wholeWordSearch: true,
      convertPDFToImage: false,
    };

    const formData = buildRedactFormData(parameters, mockFile);

    expect(formData.get('useRegex')).toBe('false');
    expect(formData.get('wholeWordSearch')).toBe('true');
    expect(formData.get('convertPDFToImage')).toBe('false');
  });

  test('should throw error for manual mode (not implemented)', () => {
    const parameters: RedactParameters = {
      ...defaultParameters,
      mode: 'manual',
    };

    expect(() => buildRedactFormData(parameters, mockFile)).toThrow('Manual redaction not yet implemented');
  });
});

describe('useRedactOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should call useToolOperation with correct configuration', async () => {
    const { useToolOperation } = await import('@app/hooks/tools/shared/useToolOperation');
    const mockUseToolOperation = vi.mocked(useToolOperation);

    renderHook(() => useRedactOperation());

    expect(mockUseToolOperation).toHaveBeenCalledWith({
      ...redactOperationConfig,
      getErrorMessage: expect.any(Function),
    });
  });

  test('should provide error handler to useToolOperation', async () => {
    const { useToolOperation } = await import('@app/hooks/tools/shared/useToolOperation');
    const mockUseToolOperation = vi.mocked(useToolOperation);

    renderHook(() => useRedactOperation());

    const callArgs = mockUseToolOperation.mock.calls[0][0];
    expect(typeof callArgs.getErrorMessage).toBe('function');
  });
});
