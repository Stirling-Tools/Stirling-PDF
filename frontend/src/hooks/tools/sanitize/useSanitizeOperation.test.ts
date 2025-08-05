import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSanitizeOperation } from './useSanitizeOperation';

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: any) => {
      if (key === 'sanitize.error' && options?.error) {
        return `Sanitization failed: ${options.error}`;
      }
      if (key === 'error.noFilesSelected') {
        return 'No files selected';
      }
      if (key === 'sanitize.error.generic') {
        return 'Sanitization failed';
      }
      return fallback || key;
    }
  })
}));

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock URL.createObjectURL and revokeObjectURL
globalThis.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
globalThis.URL.revokeObjectURL = vi.fn();

describe('useSanitizeOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should initialize with default state', () => {
    const { result } = renderHook(() => useSanitizeOperation());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.errorMessage).toBe(null);
    expect(result.current.downloadUrl).toBe(null);
    expect(result.current.status).toBe(null);
  });

  test('should execute sanitization operation successfully', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    const mockResponse = {
      ok: true,
      blob: () => Promise.resolve(mockBlob)
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useSanitizeOperation());

    const parameters = {
      removeJavaScript: true,
      removeEmbeddedFiles: false,
      removeXMPMetadata: true,
      removeMetadata: false,
      removeLinks: false,
      removeFonts: false
    };

    const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.executeOperation(parameters, [testFile]);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/security/sanitize-pdf', {
      method: 'POST',
      body: expect.any(FormData)
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.downloadUrl).toBe('mock-blob-url');
    expect(result.current.status).toBe('Sanitization completed successfully');
    expect(result.current.errorMessage).toBe(null);
  });

  test('should handle API errors correctly', async () => {
    const mockResponse = {
      ok: false,
      text: () => Promise.resolve('Server error')
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useSanitizeOperation());

    const parameters = {
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: false,
      removeMetadata: false,
      removeLinks: false,
      removeFonts: false
    };

    const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    await act(async () => {
      try {
        await result.current.executeOperation(parameters, [testFile]);
      } catch (error) {
        // Expected to throw
      }
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.errorMessage).toBe('Sanitization failed: Server error');
    expect(result.current.downloadUrl).toBe(null);
    expect(result.current.status).toBe(null);
  });

  test('should handle no files selected error', async () => {
    const { result } = renderHook(() => useSanitizeOperation());

    const parameters = {
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: false,
      removeMetadata: false,
      removeLinks: false,
      removeFonts: false
    };

    let thrownError: Error | null = null;
    await act(async () => {
      try {
        await result.current.executeOperation(parameters, []);
      } catch (error) {
        thrownError = error as Error;
      }
    });

    // The error should be thrown
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError!.message).toBe('No files selected');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('should send correct form data to API', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    const mockResponse = {
      ok: true,
      blob: () => Promise.resolve(mockBlob)
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useSanitizeOperation());

    const parameters = {
      removeJavaScript: true,
      removeEmbeddedFiles: false,
      removeXMPMetadata: true,
      removeMetadata: false,
      removeLinks: true,
      removeFonts: false
    };

    const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.executeOperation(parameters, [testFile]);
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/v1/security/sanitize-pdf');
    expect(options.method).toBe('POST');

    const formData = options.body as FormData;
    expect(formData.get('removeJavaScript')).toBe('true');
    expect(formData.get('removeEmbeddedFiles')).toBe('false');
    expect(formData.get('removeXMPMetadata')).toBe('true');
    expect(formData.get('removeMetadata')).toBe('false');
    expect(formData.get('removeLinks')).toBe('true');
    expect(formData.get('removeFonts')).toBe('false');
    expect(formData.get('fileInput')).toBe(testFile);
  });

  test('should reset results correctly', () => {
    const { result } = renderHook(() => useSanitizeOperation());

    act(() => {
      result.current.resetResults();
    });

    expect(result.current.downloadUrl).toBe(null);
    expect(result.current.errorMessage).toBe(null);
    expect(result.current.status).toBe(null);
    expect(globalThis.URL.revokeObjectURL).not.toHaveBeenCalled(); // No URL to revoke initially
  });

  test('should clear error message', async () => {
    // Mock a failed API response
    const mockResponse = {
      ok: false,
      text: () => Promise.resolve('API Error')
    };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useSanitizeOperation());

    const parameters = {
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: false,
      removeMetadata: false,
      removeLinks: false,
      removeFonts: false
    };

    const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    // Trigger an API error
    await act(async () => {
      try {
        await result.current.executeOperation(parameters, [testFile]);
      } catch (error) {
        // Expected to throw
      }
    });

    expect(result.current.errorMessage).toBeTruthy();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.errorMessage).toBe(null);
  });
});
