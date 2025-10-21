import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRotateOperation } from '@app/hooks/tools/rotate/useRotateOperation';
import type { RotateParameters } from '@app/hooks/tools/rotate/useRotateParameters';

// Mock the useToolOperation hook
vi.mock('../shared/useToolOperation', async () => {
  const actual = await vi.importActual('../shared/useToolOperation');
  return {
    ...actual,
    useToolOperation: vi.fn()
  };
});

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
import { SingleFileToolOperationConfig, ToolOperationHook, ToolType, useToolOperation } from '@app/hooks/tools/shared/useToolOperation';

describe('useRotateOperation', () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getToolConfig = () => mockUseToolOperation.mock.calls[0][0] as SingleFileToolOperationConfig<RotateParameters>;

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
    undoOperation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToolOperation.mockReturnValue(mockToolOperationReturn);
  });

  test.each([
    { angle: 0, expectedNormalized: 0 },
    { angle: 90, expectedNormalized: 90 },
    { angle: 180, expectedNormalized: 180 },
    { angle: 270, expectedNormalized: 270 },
    { angle: 360, expectedNormalized: 0 },
    { angle: -90, expectedNormalized: 270 },
    { angle: -180, expectedNormalized: 180 },
    { angle: -270, expectedNormalized: 90 },
    { angle: 450, expectedNormalized: 90 },
  ])('should create form data correctly with angle $angle (normalized to $expectedNormalized)', ({ angle, expectedNormalized }) => {
    renderHook(() => useRotateOperation());

    const callArgs = getToolConfig();

    const testParameters: RotateParameters = { angle };
    const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const formData = callArgs.buildFormData(testParameters, testFile);

    // Verify the form data contains the file
    expect(formData.get('fileInput')).toBe(testFile);

    // Verify angle parameter is normalized for backend
    expect(formData.get('angle')).toBe(expectedNormalized.toString());
  });

  test('should use correct translation for error messages', () => {
    renderHook(() => useRotateOperation());

    expect(mockT).toHaveBeenCalledWith(
      'rotate.error.failed',
      'An error occurred while rotating the PDF.'
    );
  });

  test.each([
    { property: 'toolType' as const, expectedValue: ToolType.singleFile },
    { property: 'endpoint' as const, expectedValue: '/api/v1/general/rotate-pdf' },
    { property: 'operationType' as const, expectedValue: 'rotate' }
  ])('should configure $property correctly', ({ property, expectedValue }) => {
    renderHook(() => useRotateOperation());

    const callArgs = getToolConfig();
    expect(callArgs[property]).toBe(expectedValue);
  });
});
