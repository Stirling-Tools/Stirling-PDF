import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemovePasswordOperation } from './useRemovePasswordOperation';
import type { RemovePasswordParameters } from './useRemovePasswordParameters';

// Mock the useToolOperation hook
vi.mock('../shared/useToolOperation', () => ({
  useToolOperation: vi.fn()
}));

// Mock the translation hook
const mockT = vi.fn((key: string) => `translated-${key}`);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT })
}));

// Mock the error handler
vi.mock('../../../utils/toolErrorHandler', () => ({
  createStandardErrorHandler: vi.fn(() => 'error-handler-function')
}));

// Import the mocked function
import { SingleFileToolOperationConfig, ToolOperationHook, useToolOperation } from '../shared/useToolOperation';

describe('useRemovePasswordOperation', () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getToolConfig = () => mockUseToolOperation.mock.calls[0][0] as SingleFileToolOperationConfig<RemovePasswordParameters>;

  const mockToolOperationReturn: ToolOperationHook<unknown> = {
    files: [],
    thumbnails: [],
    downloadUrl: null,
    downloadFilename: '',
    isLoading: false,
    errorMessage: null,
    status: '',
    isGeneratingThumbnails: false,
    progress: null,
    executeOperation: vi.fn(),
    resetResults: vi.fn(),
    clearError: vi.fn(),
    cancelOperation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToolOperation.mockReturnValue(mockToolOperationReturn);
  });

  test.each([
    {
      description: 'with valid password',
      password: 'test-password'
    },
    {
      description: 'with complex password',
      password: 'C0mpl3x@P@ssw0rd!'
    },
    {
      description: 'with single character password',
      password: 'a'
    }
  ])('should create form data correctly $description', ({ password }) => {
    renderHook(() => useRemovePasswordOperation());

    const callArgs = getToolConfig();
    const buildFormData = callArgs.buildFormData;

    const testParameters: RemovePasswordParameters = {
      password
    };

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const formData = buildFormData(testParameters, testFile as any);

    // Verify the form data contains the file
    expect(formData.get('fileInput')).toBe(testFile);

    // Verify password parameter
    expect(formData.get('password')).toBe(password);
  });

  test('should use correct translation for error messages', () => {
    renderHook(() => useRemovePasswordOperation());

    expect(mockT).toHaveBeenCalledWith(
      'removePassword.error.failed',
      'An error occurred while removing the password from the PDF.'
    );
  });

  test.each([
    { property: 'toolType' as const, expectedValue: 'singleFile' },
    { property: 'endpoint' as const, expectedValue: '/api/v1/security/remove-password' },
    { property: 'filePrefix' as const, expectedValue: 'translated-removePassword.filenamePrefix_' },
    { property: 'operationType' as const, expectedValue: 'removePassword' }
  ])('should configure $property correctly', ({ property, expectedValue }) => {
    renderHook(() => useRemovePasswordOperation());

    const callArgs = getToolConfig();
    expect(callArgs[property]).toBe(expectedValue);
  });
});
