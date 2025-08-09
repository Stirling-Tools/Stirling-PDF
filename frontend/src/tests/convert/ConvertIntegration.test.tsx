/**
 * Integration tests for Convert Tool - Tests actual conversion functionality
 * 
 * These tests verify the integration between frontend components and backend:
 * 1. useConvertOperation hook makes correct API calls
 * 2. File upload/download flow functions properly
 * 3. Error handling works for various failure scenarios
 * 4. Parameter passing works between frontend and backend
 * 5. FileContext integration works correctly
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConvertOperation } from '../../hooks/tools/convert/useConvertOperation';
import { ConvertParameters } from '../../hooks/tools/convert/useConvertParameters';
import { FileContextProvider } from '../../contexts/FileContext';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/config';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock only essential services that are actually called by the tests
vi.mock('../../services/fileStorage', () => ({
  fileStorage: {
    init: vi.fn().mockResolvedValue(undefined),
    storeFile: vi.fn().mockImplementation((file, thumbnail) => {
      return Promise.resolve({ 
        id: `mock-id-${file.name}`, 
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        thumbnail: thumbnail
      });
    }),
    getAllFileMetadata: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../services/thumbnailGenerationService', () => ({
  thumbnailGenerationService: {
    generateThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,fake-thumbnail'),
    cleanup: vi.fn(),
    destroy: vi.fn()
  }
}));

// Create realistic test files
const createTestFile = (name: string, content: string, type: string): File => {
  return new File([content], name, { type });
};

const createPDFFile = (): File => {
  const pdfContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\ntrailer\n<<\n/Size 2\n/Root 1 0 R\n>>\nstartxref\n0\n%%EOF';
  return createTestFile('test.pdf', pdfContent, 'application/pdf');
};

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <FileContextProvider>
      {children}
    </FileContextProvider>
  </I18nextProvider>
);

describe('Convert Tool Integration Tests', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default axios mock
    mockedAxios.post = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useConvertOperation Integration', () => {
    
    test('should make correct API call for PDF to PNG conversion', async () => {
      const mockBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      mockedAxios.post.mockResolvedValueOnce({
        data: mockBlob,
        status: 200,
        statusText: 'OK'
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      // Verify axios was called with correct parameters
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/v1/convert/pdf/img',
        expect.any(FormData),
        { responseType: 'blob' }
      );

      // Verify FormData contains correct parameters
      const formDataCall = mockedAxios.post.mock.calls[0][1] as FormData;
      expect(formDataCall.get('imageFormat')).toBe('png');
      expect(formDataCall.get('colorType')).toBe('color');
      expect(formDataCall.get('dpi')).toBe('300');
      expect(formDataCall.get('singleOrMultiple')).toBe('multiple');

      // Verify hook state updates
      expect(result.current.downloadUrl).toBeTruthy();
      expect(result.current.downloadFilename).toBe('test_converted.png');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.errorMessage).toBe(null);
    });

    test('should handle API error responses correctly', async () => {
      const errorMessage = 'Invalid file format';
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: errorMessage
        },
        message: errorMessage
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createTestFile('invalid.txt', 'not a pdf', 'text/plain');
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      // Verify error handling
      expect(result.current.errorMessage).toBe(errorMessage);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.downloadUrl).toBe(null);
    });

    test('should handle network errors gracefully', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      expect(result.current.errorMessage).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('API and Hook Integration', () => {
    
    test('should correctly map image conversion parameters to API call', async () => {
      const mockBlob = new Blob(['fake-data'], { type: 'image/jpeg' });
      mockedAxios.post.mockResolvedValueOnce({ 
        data: mockBlob,
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-disposition': 'attachment; filename="test_converted.jpg"'
        }
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'jpg',
        pageNumbers: 'all',
        imageOptions: {
          colorType: 'grayscale',
          dpi: 150,
          singleOrMultiple: 'single',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      // Verify integration: hook parameters → FormData → axios call → hook state
      const formDataCall = mockedAxios.post.mock.calls[0][1] as FormData;
      expect(formDataCall.get('imageFormat')).toBe('jpg');
      expect(formDataCall.get('colorType')).toBe('grayscale');
      expect(formDataCall.get('dpi')).toBe('150');
      expect(formDataCall.get('singleOrMultiple')).toBe('single');
      
      // Verify complete workflow: API response → hook state → FileContext integration
      expect(result.current.downloadUrl).toBeTruthy();
      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].name).toBe('test_converted.jpg');
      expect(result.current.isLoading).toBe(false);
    });

    test('should make correct API call for PDF to CSV conversion with simplified workflow', async () => {
      const mockBlob = new Blob(['fake-csv-data'], { type: 'text/csv' });
      mockedAxios.post.mockResolvedValueOnce({
        data: mockBlob,
        status: 200,
        statusText: 'OK'
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'csv',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      // Verify correct endpoint is called
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/v1/convert/pdf/csv',
        expect.any(FormData),
        { responseType: 'blob' }
      );

      // Verify FormData contains correct parameters for simplified CSV conversion
      const formDataCall = mockedAxios.post.mock.calls[0][1] as FormData;
      expect(formDataCall.get('pageNumbers')).toBe('all'); // Always "all" for simplified workflow
      expect(formDataCall.get('fileInput')).toBe(testFile);

      // Verify hook state updates correctly
      expect(result.current.downloadUrl).toBeTruthy();
      expect(result.current.downloadFilename).toBe('test_converted.csv');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.errorMessage).toBe(null);
    });

    test('should handle complete unsupported conversion workflow', async () => {
      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'unsupported',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      // Verify integration: utils validation prevents API call, hook shows error
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(result.current.errorMessage).toContain('errorNotSupported');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.downloadUrl).toBe(null);
    });
  });

  describe('File Upload Integration', () => {
    
    test('should handle multiple file uploads correctly', async () => {
      const mockBlob = new Blob(['zip-content'], { type: 'application/zip' });
      mockedAxios.post.mockResolvedValueOnce({ data: mockBlob });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });
      const files = [
        createPDFFile(),
        createTestFile('test2.pdf', '%PDF-1.4...', 'application/pdf')
      ]
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, files);
      });

      // Verify both files were uploaded
      const calls = mockedAxios.post.mock.calls;

      for (let i = 0; i < calls.length; i++) {
        const formData = calls[i][1] as FormData;
        const fileInputs = formData.getAll('fileInput');
        expect(fileInputs).toHaveLength(1);
        expect(fileInputs[0]).toBeInstanceOf(File);
        expect(fileInputs[0].name).toBe(files[i].name);
      }

    });

    test('should handle no files selected', async () => {
      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, []);
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(result.current.errorMessage).toContain('noFileSelected');
    });
  });

  describe('Error Boundary Integration', () => {
    
    test('should handle corrupted file gracefully', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 422,
          data: 'Processing failed'
        }
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const corruptedFile = createTestFile('corrupted.pdf', 'not-a-pdf', 'application/pdf');
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [corruptedFile]);
      });

      expect(result.current.errorMessage).toBe('Processing failed');
      expect(result.current.isLoading).toBe(false);
    });

    test('should handle backend service unavailable', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 503,
          data: 'Service unavailable'
        }
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      expect(result.current.errorMessage).toBe('Service unavailable');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('FileContext Integration', () => {
    
    test('should record operation in FileContext', async () => {
      const mockBlob = new Blob(['fake-data'], { type: 'image/png' });
      mockedAxios.post.mockResolvedValueOnce({ 
        data: mockBlob,
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename="test_converted.png"'
        }
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      // Verify operation was successful and files were processed
      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].name).toBe('test_converted.png');
      expect(result.current.downloadUrl).toBeTruthy();
    });

    test('should clean up blob URLs on reset', async () => {
      const mockBlob = new Blob(['fake-data'], { type: 'image/png' });
      mockedAxios.post.mockResolvedValueOnce({ 
        data: mockBlob,
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename="test_converted.png"'
        }
      });

      const { result } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const testFile = createPDFFile();
      const parameters: ConvertParameters = {
        fromExtension: 'pdf',
        toExtension: 'png',
        imageOptions: {
          colorType: 'color',
          dpi: 300,
          singleOrMultiple: 'multiple',
          fitOption: 'maintainAspectRatio',
          autoRotate: true,
          combineImages: true
        },
        isSmartDetection: false,
        smartDetectionType: 'none'
      };

      await act(async () => {
        await result.current.executeOperation(parameters, [testFile]);
      });

      expect(result.current.downloadUrl).toBeTruthy();

      act(() => {
        result.current.resetResults();
      });

      expect(result.current.downloadUrl).toBe(null);
      expect(result.current.files).toHaveLength(0);
      expect(result.current.errorMessage).toBe(null);
    });
  });
});

/**
 * Additional Integration Tests That Require Real Backend
 * 
 * These tests would require a running backend server and are better suited
 * for E2E testing with tools like Playwright or Cypress:
 * 
 * 1. **Real File Conversion Tests**
 *    - Upload actual PDF files and verify conversion quality
 *    - Test image format outputs are valid and viewable
 *    - Test CSV/TXT outputs contain expected content
 *    - Test file size limits and memory constraints
 * 
 * 2. **Performance Integration Tests**
 *    - Test conversion time for various file sizes
 *    - Test memory usage during large file conversions
 *    - Test concurrent conversion requests
 *    - Test timeout handling for long-running conversions
 * 
 * 3. **Authentication Integration**
 *    - Test conversions with and without authentication
 *    - Test rate limiting and user quotas
 *    - Test permission-based endpoint access
 * 
 * 4. **File Preview Integration**
 *    - Test that converted files integrate correctly with viewer
 *    - Test thumbnail generation for converted files
 *    - Test file download functionality
 *    - Test FileContext persistence across tool switches
 * 
 * 5. **Endpoint Availability Tests**
 *    - Test real endpoint availability checking
 *    - Test graceful degradation when endpoints are disabled
 *    - Test dynamic endpoint configuration updates
 */