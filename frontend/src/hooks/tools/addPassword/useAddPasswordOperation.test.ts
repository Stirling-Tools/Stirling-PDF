import { describe, expect, test, vi, beforeEach, MockedFunction } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAddPasswordOperation } from './useAddPasswordOperation';
import type { AddPasswordFullParameters, AddPasswordParameters } from './useAddPasswordParameters';

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


describe('useAddPasswordOperation', () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getToolConfig = () => mockUseToolOperation.mock.calls[0][0] as SingleFileToolOperationConfig<AddPasswordFullParameters>;

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
      description: 'with all parameters filled',
      password: 'user-password',
      ownerPassword: 'owner-password',
      keyLength: 256
    },
    {
      description: 'with empty passwords',
      password: '',
      ownerPassword: '',
      keyLength: 128
    },
    {
      description: 'with 40-bit key length',
      password: 'test',
      ownerPassword: '',
      keyLength: 40
    }
  ])('should create form data correctly $description', ({ password, ownerPassword, keyLength }) => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    const buildFormData = callArgs.buildFormData;

    const testParameters: AddPasswordFullParameters = {
      password,
      ownerPassword,
      keyLength,
      permissions: {
        preventAssembly: false,
        preventExtractContent: false,
        preventExtractForAccessibility: false,
        preventFillInForm: false,
        preventModify: false,
        preventModifyAnnotations: false,
        preventPrinting: false,
        preventPrintingFaithful: false
      }
    };

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const formData = buildFormData(testParameters, testFile);

    // Verify the form data contains the file
    expect(formData.get('fileInput')).toBe(testFile);

    // Verify password parameters
    expect(formData.get('password')).toBe(password);
    expect(formData.get('ownerPassword')).toBe(ownerPassword);
    expect(formData.get('keyLength')).toBe(keyLength.toString());
  });

  test('should use correct translation for error messages', () => {
    renderHook(() => useAddPasswordOperation());

    expect(mockT).toHaveBeenCalledWith(
      'addPassword.error.failed',
      'An error occurred while encrypting the PDF.'
    );
  });

  test.each([
    { property: 'toolType' as const, expectedValue: 'singleFile' },
    { property: 'endpoint' as const, expectedValue: '/api/v1/security/add-password' },
    { property: 'filePrefix' as const, expectedValue: 'translated-addPassword.filenamePrefix_' },
    { property: 'operationType' as const, expectedValue: 'addPassword' }
  ])('should configure $property correctly', ({ property, expectedValue }) => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    expect(callArgs[property]).toBe(expectedValue);
  });
});
