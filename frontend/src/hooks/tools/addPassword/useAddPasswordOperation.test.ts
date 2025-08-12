import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAddPasswordOperation } from './useAddPasswordOperation';
import type { AddPasswordParameters } from './useAddPasswordParameters';

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

describe('useAddPasswordOperation', () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

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
      filePrefix: 'passworded_',
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
    const callArgs: ToolOperationConfig<AddPasswordParameters> = mockUseToolOperation.mock.calls[0][0];
    const buildFormData = callArgs.buildFormData;

    const testParameters: AddPasswordParameters = {
      password: 'user-password',
      ownerPassword: 'owner-password',
      keyLength: 256,
      preventAssembly: true,
      preventExtractContent: false,
      preventExtractForAccessibility: true,
      preventFillInForm: false,
      preventModify: true,
      preventModifyAnnotations: false,
      preventPrinting: true,
      preventPrintingFaithful: false
    };

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const formData = buildFormData(testParameters, testFile as any /* FIX ME */);

    // Verify the form data contains the file
    expect(formData.get('fileInput')).toBe(testFile);

    // Verify password parameters
    expect(formData.get('password')).toBe('user-password');
    expect(formData.get('ownerPassword')).toBe('owner-password');
    expect(formData.get('keyLength')).toBe('256');

    // Verify boolean parameters are converted to strings
    expect(formData.get('preventAssembly')).toBe('true');
    expect(formData.get('preventExtractContent')).toBe('false');
    expect(formData.get('preventExtractForAccessibility')).toBe('true');
    expect(formData.get('preventFillInForm')).toBe('false');
    expect(formData.get('preventModify')).toBe('true');
    expect(formData.get('preventModifyAnnotations')).toBe('false');
    expect(formData.get('preventPrinting')).toBe('true');
    expect(formData.get('preventPrintingFaithful')).toBe('false');
  });

  test('should handle empty passwords in form data', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs: ToolOperationConfig<AddPasswordParameters> = mockUseToolOperation.mock.calls[0][0];
    const buildFormData = callArgs.buildFormData;

    const testParameters: AddPasswordParameters = {
      password: '',
      ownerPassword: '',
      keyLength: 128,
      preventAssembly: false,
      preventExtractContent: false,
      preventExtractForAccessibility: false,
      preventFillInForm: false,
      preventModify: false,
      preventModifyAnnotations: false,
      preventPrinting: false,
      preventPrintingFaithful: false
    };

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const formData = buildFormData(testParameters, testFile as any /* FIX ME */);

    expect(formData.get('password')).toBe('');
    expect(formData.get('ownerPassword')).toBe('');
    expect(formData.get('keyLength')).toBe('128');
  });

  test('should handle different key length values', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs: ToolOperationConfig<AddPasswordParameters> = mockUseToolOperation.mock.calls[0][0];
    const buildFormData = callArgs.buildFormData;

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });

    // Test 40-bit encryption
    const params40: AddPasswordParameters = {
      password: 'test',
      ownerPassword: '',
      keyLength: 40,
      preventAssembly: false,
      preventExtractContent: false,
      preventExtractForAccessibility: false,
      preventFillInForm: false,
      preventModify: false,
      preventModifyAnnotations: false,
      preventPrinting: false,
      preventPrintingFaithful: false
    };

    let formData = buildFormData(params40, testFile as any /* FIX ME */);
    expect(formData.get('keyLength')).toBe('40');

    // Test 256-bit encryption
    const params256: AddPasswordParameters = {
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
      'An error occurred while adding password to the PDF.'
    );
  });

  test('should configure single file endpoint', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs: ToolOperationConfig<AddPasswordParameters> = mockUseToolOperation.mock.calls[0][0];
    expect(callArgs.multiFileEndpoint).toBe(false);
  });

  test('should use correct endpoint URL', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs: ToolOperationConfig<AddPasswordParameters> = mockUseToolOperation.mock.calls[0][0];
    expect(callArgs.endpoint).toBe('/api/v1/security/add-password');
  });

  test('should use correct file prefix', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs: ToolOperationConfig<AddPasswordParameters> = mockUseToolOperation.mock.calls[0][0];
    expect(callArgs.filePrefix).toBe('passworded_');
  });

  test('should use correct operation type', () => {
    renderHook(() => useAddPasswordOperation());

    const callArgs: ToolOperationConfig<AddPasswordParameters> = mockUseToolOperation.mock.calls[0][0];
    expect(callArgs.operationType).toBe('addPassword');
  });
});
