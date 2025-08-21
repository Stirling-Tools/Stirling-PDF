import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChangePermissionsOperation } from './useChangePermissionsOperation';
import type { ChangePermissionsParameters } from './useChangePermissionsParameters';

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

describe('useChangePermissionsOperation', () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getToolConfig = () => mockUseToolOperation.mock.calls[0][0] as SingleFileToolOperationConfig<ChangePermissionsParameters>;

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
      preventAssembly: false,
      preventExtractContent: false,
      preventExtractForAccessibility: false,
      preventFillInForm: false,
      preventModify: false,
      preventModifyAnnotations: false,
      preventPrinting: false,
      preventPrintingFaithful: false,
    },
    {
      preventAssembly: true,
      preventExtractContent: false,
      preventExtractForAccessibility: true,
      preventFillInForm: false,
      preventModify: true,
      preventModifyAnnotations: false,
      preventPrinting: true,
      preventPrintingFaithful: false,
    },
    {
      preventAssembly: true,
      preventExtractContent: true,
      preventExtractForAccessibility: true,
      preventFillInForm: true,
      preventModify: true,
      preventModifyAnnotations: true,
      preventPrinting: true,
      preventPrintingFaithful: true,
    },
  ])('should create form data correctly', (testParameters: ChangePermissionsParameters) => {
    renderHook(() => useChangePermissionsOperation());

    const callArgs = getToolConfig();
    const buildFormData = callArgs.buildFormData;

    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const formData = buildFormData(testParameters, testFile);

    // Verify the form data contains the file
    expect(formData.get('fileInput')).toBe(testFile);

    (Object.keys(testParameters) as Array<keyof ChangePermissionsParameters>).forEach(key => {
      expect(formData.get(key), `Parameter ${key} should be set correctly`).toBe(testParameters[key].toString());
    });
  });

  test('should use correct translation for error messages', () => {
    renderHook(() => useChangePermissionsOperation());

    expect(mockT).toHaveBeenCalledWith(
      'changePermissions.error.failed',
      'An error occurred while changing PDF permissions.'
    );
  });

  test.each([
    { property: 'toolType' as const, expectedValue: 'singleFile' },
    { property: 'endpoint' as const, expectedValue: '/api/v1/security/add-password' },
    { property: 'filePrefix' as const, expectedValue: 'permissions_' },
    { property: 'operationType' as const, expectedValue: 'changePermissions' }
  ])('should configure $property correctly', ({ property, expectedValue }) => {
    renderHook(() => useChangePermissionsOperation());

    const callArgs = getToolConfig();
    expect(callArgs[property]).toBe(expectedValue);
  });
});
