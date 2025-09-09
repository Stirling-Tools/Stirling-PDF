import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMergeOperation } from './useMergeOperation';
import type { MergeParameters } from './useMergeParameters';

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
import { MultiFileToolOperationConfig, ToolOperationHook, useToolOperation } from '../shared/useToolOperation';

describe('useMergeOperation', () => {
  const mockUseToolOperation = vi.mocked(useToolOperation<MergeParameters>);

  const getToolConfig = () => mockUseToolOperation.mock.calls[0][0] as MultiFileToolOperationConfig<MergeParameters>;

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
    undoOperation: function (): Promise<void> {
      throw new Error('Function not implemented.');
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToolOperation.mockReturnValue(mockToolOperationReturn);
  });

  test('should build FormData correctly', () => {
    renderHook(() => useMergeOperation());

    const config = getToolConfig();
    const mockFiles = [
      new File(['content1'], 'file1.pdf', { type: 'application/pdf' }),
      new File(['content2'], 'file2.pdf', { type: 'application/pdf' })
    ];
    const parameters: MergeParameters = {
      removeDigitalSignature: true,
      generateTableOfContents: false
    };

    const formData = config.buildFormData(parameters, mockFiles);

    // Verify files are appended
    expect(formData.getAll('fileInput')).toHaveLength(2);
    expect(formData.getAll('fileInput')[0]).toBe(mockFiles[0]);
    expect(formData.getAll('fileInput')[1]).toBe(mockFiles[1]);

    // Verify parameters are appended correctly
    expect(formData.get('sortType')).toBe('orderProvided');
    expect(formData.get('removeCertSign')).toBe('true');
    expect(formData.get('generateToc')).toBe('false');
  });

  test('should handle response correctly', () => {
    renderHook(() => useMergeOperation());

    const config = getToolConfig();
    const mockBlob = new Blob(['merged content'], { type: 'application/pdf' });
    const mockFiles = [
      new File(['content1'], 'file1.pdf', { type: 'application/pdf' }),
      new File(['content2'], 'file2.pdf', { type: 'application/pdf' })
    ];

    const result = config.responseHandler!(mockBlob, mockFiles) as File[];

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('merged_file1.pdf');
    expect(result[0].type).toBe('application/pdf');
    expect(result[0].size).toBe(mockBlob.size);
  });

  test('should return the hook result from useToolOperation', () => {
    const { result } = renderHook(() => useMergeOperation());

    expect(result.current).toBe(mockToolOperationReturn);
  });

  test('should use correct translation keys for error handling', () => {
    renderHook(() => useMergeOperation());

    expect(mockT).toHaveBeenCalledWith('merge.error.failed', 'An error occurred while merging the PDFs.');
  });

  test('should build FormData with different parameter combinations', () => {
    renderHook(() => useMergeOperation());

    const config = getToolConfig();
    const mockFiles = [new File(['test'], 'test.pdf', { type: 'application/pdf' })];

    // Test case 1: All options disabled
    const params1: MergeParameters = {
      removeDigitalSignature: false,
      generateTableOfContents: false
    };
    const formData1 = config.buildFormData(params1, mockFiles);
    expect(formData1.get('removeCertSign')).toBe('false');
    expect(formData1.get('generateToc')).toBe('false');

    // Test case 2: All options enabled
    const params2: MergeParameters = {
      removeDigitalSignature: true,
      generateTableOfContents: true
    };
    const formData2 = config.buildFormData(params2, mockFiles);
    expect(formData2.get('removeCertSign')).toBe('true');
    expect(formData2.get('generateToc')).toBe('true');
  });
});
