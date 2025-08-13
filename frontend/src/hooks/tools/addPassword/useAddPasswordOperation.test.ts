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
import { ToolOperationConfig, ToolOperationHook, useToolOperation } from '../shared/useToolOperation';
import { get } from 'http';



describe('useAddPasswordOperation', () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getToolConfig = (): ToolOperationConfig<AddPasswordFullParameters> => mockUseToolOperation.mock.calls[0][0];

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

  test('should configure useToolOperation with correct parameters', () => {
    renderHook(() => useAddPasswordOperation());

    expect(mockUseToolOperation).toHaveBeenCalledWith({
      operationType: 'addPassword',
      endpoint: '/api/v1/security/add-password',
      buildFormData: expect.any(Function),
      filePrefix: 'translated-addPassword.filenamePrefix_',
      multiFileEndpoint: false,
      getErrorMessage: 'error-handler-function'
    });
  });

  test('should return the result from useToolOperation', () => {
    const { result } = renderHook(() => useAddPasswordOperation());

    expect(result.current).toBe(mockToolOperationReturn);
  });

  test('should create form data correctly with all parameters', () => {
    renderHook(() => useAddPasswordOperation());

    // Get the buildFormData function that was passed to useToolOperation
    const callArgs = getToolConfig();
    const buildFormData = callArgs.buildFormData;

    const testParameters: AddPasswordFullParameters = {
      password: 'user-password',
      ownerPassword: 'owner-password',
      keyLength: 256,
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
    const formData = buildFormData(testParameters, testFile as any /* FIX ME */);

    // Verify the form data contains the file
    expect(formData.get('fileInput')).toBe(testFile);

    // Verify password parameters
    expect(formData.get('password')).toBe('user-password');
    expect(formData.get('ownerPassword')).toBe('owner-password');
    expect(formData.get('keyLength')).toBe('256');
  });

  test('should handle empty passwords in form data', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    const buildFormData = callArgs.buildFormData;

    const testParameters: AddPasswordFullParameters = {
      password: '',
      ownerPassword: '',
      keyLength: 128,
      permissions: {
        preventAssembly: false,
        preventExtractContent: false,
        preventExtractForAccessibility: false,
        preventFillInForm: false,
        preventModify: false,
        preventModifyAnnotations: false,
        preventPrinting: false,
        preventPrintingFaithful: false,
      }
    };

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const formData = buildFormData(testParameters, testFile as any /* FIX ME */);

    expect(formData.get('password')).toBe('');
    expect(formData.get('ownerPassword')).toBe('');
    expect(formData.get('keyLength')).toBe('128');
  });

  test('should handle different key length values', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    const buildFormData = callArgs.buildFormData;

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });

    // Test 40-bit encryption
    const params40: AddPasswordFullParameters = {
      password: 'test',
      ownerPassword: '',
      keyLength: 40,
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

    let formData = buildFormData(params40, testFile as any /* FIX ME */);
    expect(formData.get('keyLength')).toBe('40');

    // Test 256-bit encryption
    const params256: AddPasswordFullParameters = {
      ...params40,
      keyLength: 256
    };

    formData = buildFormData(params256, testFile as any /* FIX ME */);
    expect(formData.get('keyLength')).toBe('256');
  });

  test('should use correct translation for error messages', () => {
    renderHook(() => useAddPasswordOperation());

    expect(mockT).toHaveBeenCalledWith(
      'addPassword.error.failed',
      'An error occurred while encrypting the PDF.'
    );
  });

  test('should configure single file endpoint', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    expect(callArgs.multiFileEndpoint).toBe(false);
  });

  test('should use correct endpoint URL', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    expect(callArgs.endpoint).toBe('/api/v1/security/add-password');
  });

  test('should use correct file prefix', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    expect(callArgs.filePrefix).toBe('translated-addPassword.filenamePrefix_');
  });

  test('should use correct operation type', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs = getToolConfig();
    expect(callArgs.operationType).toBe('addPassword');
  });
});
