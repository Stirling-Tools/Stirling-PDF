/**
 * Integration tests for Convert Tool Smart Detection with real file scenarios
 * Tests the complete flow from file upload through auto-detection to API calls
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConvertOperation } from '@app/hooks/tools/convert/useConvertOperation';
import { useConvertParameters } from '@app/hooks/tools/convert/useConvertParameters';
import { FileContextProvider } from '@app/contexts/FileContext';
import { PreferencesProvider } from '@app/contexts/PreferencesContext';
import { I18nextProvider } from 'react-i18next';
import i18n from '@app/i18n/config';
import { detectFileExtension } from '@app/utils/fileUtils';
import { FIT_OPTIONS } from '@app/constants/convertConstants';
import { createTestStirlingFile, createTestFilesWithId } from '@app/tests/utils/testFileHelpers';
import { MantineProvider } from '@mantine/core';

// Mock axios (for static methods like CancelToken, isCancel)
vi.mock('axios', () => ({
  default: {
    CancelToken: {
      source: vi.fn(() => ({
        token: 'mock-cancel-token',
        cancel: vi.fn()
      }))
    },
    isCancel: vi.fn(() => false),
  }
}));

// Mock our apiClient service
vi.mock('../../services/apiClient', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn()
      }
    }
  }
}));

// Import the mocked apiClient
import apiClient from '@app/services/apiClient';
const mockedApiClient = vi.mocked(apiClient);

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

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MantineProvider>
    <I18nextProvider i18n={i18n}>
      <PreferencesProvider>
        <FileContextProvider>
          {children}
        </FileContextProvider>
      </PreferencesProvider>
    </I18nextProvider>
  </MantineProvider>
);

describe('Convert Tool - Smart Detection Integration Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful API response
    (mockedApiClient.post as Mock).mockResolvedValue({
      data: new Blob(['fake converted content'], { type: 'application/pdf' })
    });
  });

  afterEach(() => {
    // Clean up any blob URLs created during tests
    vi.restoreAllMocks();
  });

  describe('Single File Auto-Detection Flow', () => {
    test('should auto-detect PDF from DOCX and convert to PDF', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      // Create mock DOCX file
      const docxFile = createTestStirlingFile('document.docx', 'docx content', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      // Test auto-detection
      act(() => {
        paramsResult.current.analyzeFileTypes([docxFile]);
      });

      await waitFor(() => {
        expect(paramsResult.current.parameters.fromExtension).toBe('docx');
        expect(paramsResult.current.parameters.toExtension).toBe('pdf');
        expect(paramsResult.current.parameters.isSmartDetection).toBe(false);
      });

      // Test conversion operation
      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          [docxFile]
        );
      });

      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/convert/file/pdf', expect.any(FormData), {
        responseType: 'blob'
      });
    });

    test('should handle unknown file type with file-to-pdf fallback', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      // Create mock unknown file
      const unknownFile = createTestStirlingFile('document.xyz', 'unknown content', 'application/octet-stream');

      // Test auto-detection
      act(() => {
        paramsResult.current.analyzeFileTypes([unknownFile]);
      });

      await waitFor(() => {
        expect(paramsResult.current.parameters.fromExtension).toBe('file-xyz');
        expect(paramsResult.current.parameters.toExtension).toBe('pdf'); // Fallback
        expect(paramsResult.current.parameters.isSmartDetection).toBe(false);
      });

      // Test conversion operation
      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          [unknownFile]
        );
      });

      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/convert/file/pdf', expect.any(FormData), {
        responseType: 'blob'
      });
    });
  });

  describe('Multi-File Smart Detection Flow', () => {

    test('should detect all images and use img-to-pdf endpoint', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      // Create mock image files
      const imageFiles = createTestFilesWithId([
        { name: 'photo1.jpg', content: 'jpg content', type: 'image/jpeg' },
        { name: 'photo2.png', content: 'png content', type: 'image/png' },
        { name: 'photo3.gif', content: 'gif content', type: 'image/gif' }
      ]);

      // Test smart detection for all images
      act(() => {
        paramsResult.current.analyzeFileTypes(imageFiles);
      });

      await waitFor(() => {
        expect(paramsResult.current.parameters.fromExtension).toBe('image');
        expect(paramsResult.current.parameters.toExtension).toBe('pdf');
        expect(paramsResult.current.parameters.isSmartDetection).toBe(true);
        expect(paramsResult.current.parameters.smartDetectionType).toBe('images');
      });

      // Test conversion operation
      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          imageFiles
        );
      });

      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/convert/img/pdf', expect.any(FormData), {
        responseType: 'blob'
      });

      // Should send all files in single request
      const formData = (mockedApiClient.post as Mock).mock.calls[0][1] as FormData;
      const files = formData.getAll('fileInput');
      expect(files).toHaveLength(3);
    });

    test('should detect mixed file types and use file-to-pdf endpoint', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      // Create mixed file types
      const mixedFiles = createTestFilesWithId([
        { name: 'document.pdf', content: 'pdf content', type: 'application/pdf' },
        { name: 'spreadsheet.xlsx', content: 'docx content', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { name: 'presentation.pptx', content: 'pptx content', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
      ]);

      // Test smart detection for mixed types
      act(() => {
        paramsResult.current.analyzeFileTypes(mixedFiles);
      });

      await waitFor(() => {
        expect(paramsResult.current.parameters.fromExtension).toBe('any');
        expect(paramsResult.current.parameters.toExtension).toBe('pdf');
        expect(paramsResult.current.parameters.isSmartDetection).toBe(true);
        expect(paramsResult.current.parameters.smartDetectionType).toBe('mixed');
      });

      // Test conversion operation
      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          mixedFiles
        );
      });

      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/convert/file/pdf', expect.any(FormData), {
        responseType: 'blob'
      });
    });

    test('should detect all web files and use html-to-pdf endpoint', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      // Create mock web files
      const webFiles = createTestFilesWithId([
        { name: 'page1.html', content: '<html>content</html>', type: 'text/html' },
        { name: 'site.zip', content: 'zip content', type: 'application/zip' }
      ]);

      // Test smart detection for web files
      act(() => {
        paramsResult.current.analyzeFileTypes(webFiles);
      });

      await waitFor(() => {
        expect(paramsResult.current.parameters.fromExtension).toBe('html');
        expect(paramsResult.current.parameters.toExtension).toBe('pdf');
        expect(paramsResult.current.parameters.isSmartDetection).toBe(true);
        expect(paramsResult.current.parameters.smartDetectionType).toBe('web');
      });

      // Test conversion operation
      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          webFiles
        );
      });

      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/convert/html/pdf', expect.any(FormData), {
        responseType: 'blob'
      });

      // Should process files separately for web files
      expect(mockedApiClient.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('Web and Email Conversion Options Integration', () => {

    test('should send correct HTML parameters for web-to-pdf conversion', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const htmlFile = createTestStirlingFile('page.html', '<html>content</html>', 'text/html');

      // Set up HTML conversion parameters
      act(() => {
        paramsResult.current.analyzeFileTypes([htmlFile]);
        paramsResult.current.updateParameter('htmlOptions', {
          zoomLevel: 1.5
        });
      });

      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          [htmlFile]
        );
      });

      const formData = (mockedApiClient.post as Mock).mock.calls[0][1] as FormData;
      expect(formData.get('zoom')).toBe('1.5');
    });

    test('should send correct email parameters for eml-to-pdf conversion', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const emlFile = createTestStirlingFile('email.eml', 'email content', 'message/rfc822');

      // Set up email conversion parameters
      act(() => {
        paramsResult.current.updateParameter('fromExtension', 'eml');
        paramsResult.current.updateParameter('toExtension', 'pdf');
        paramsResult.current.updateParameter('emailOptions', {
          includeAttachments: false,
          maxAttachmentSizeMB: 20,
          downloadHtml: true,
          includeAllRecipients: true
        });
      });

      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          [emlFile]
        );
      });

      const formData = (mockedApiClient.post as Mock).mock.calls[0][1] as FormData;
      expect(formData.get('includeAttachments')).toBe('false');
      expect(formData.get('maxAttachmentSizeMB')).toBe('20');
      expect(formData.get('downloadHtml')).toBe('true');
      expect(formData.get('includeAllRecipients')).toBe('true');
    });

    test('should send correct PDF/A parameters for pdf-to-pdfa conversion', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const pdfFile = createTestStirlingFile('document.pdf', 'pdf content', 'application/pdf');

      // Set up PDF/A conversion parameters
      act(() => {
        paramsResult.current.updateParameter('fromExtension', 'pdf');
        paramsResult.current.updateParameter('toExtension', 'pdfa');
        paramsResult.current.updateParameter('pdfaOptions', {
          outputFormat: 'pdfa',
          strict: false
        });
      });

      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          [pdfFile]
        );
      });

      const formData = (mockedApiClient.post as Mock).mock.calls[0][1] as FormData;
      expect(formData.get('outputFormat')).toBe('pdfa');
      expect(formData.get('strict')).toBe('false');
      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/convert/pdf/pdfa', expect.any(FormData), {
        responseType: 'blob'
      });
    });
  });

  describe('Image Conversion Options Integration', () => {

    test('should send correct parameters for image-to-pdf conversion', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const imageFiles = createTestFilesWithId([
        { name: 'photo1.jpg', content: 'jpg1', type: 'image/jpeg' },
        { name: 'photo2.jpg', content: 'jpg2', type: 'image/jpeg' }
      ]);

      // Set up image conversion parameters
      act(() => {
        paramsResult.current.analyzeFileTypes(imageFiles);
        paramsResult.current.updateParameter('imageOptions', {
          colorType: 'grayscale',
          dpi: 150,
          singleOrMultiple: 'single',
          fitOption: FIT_OPTIONS.FIT_PAGE,
          autoRotate: false,
          combineImages: true
        });
      });

      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          imageFiles
        );
      });

      const formData = (mockedApiClient.post as Mock).mock.calls[0][1] as FormData;
      expect(formData.get('fitOption')).toBe(FIT_OPTIONS.FIT_PAGE);
      expect(formData.get('colorType')).toBe('grayscale');
      expect(formData.get('autoRotate')).toBe('false');
    });

    test('should process images separately when combineImages is false', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      const imageFiles = createTestFilesWithId([
        { name: 'photo1.jpg', content: 'jpg1', type: 'image/jpeg' },
        { name: 'photo2.jpg', content: 'jpg2', type: 'image/jpeg' }
      ]);

      // Set up for separate processing
      act(() => {
        paramsResult.current.analyzeFileTypes(imageFiles);
        paramsResult.current.updateParameter('imageOptions', {
          ...paramsResult.current.parameters.imageOptions,
          combineImages: false
        });
      });

      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          imageFiles
        );
      });

      // Should make separate API calls for each file
      expect(mockedApiClient.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Scenarios in Smart Detection', () => {


    test('should handle partial failures in multi-file processing', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });

      // Mock one success, one failure
      (mockedApiClient.post as Mock)
        .mockResolvedValueOnce({
          data: new Blob(['converted1'], { type: 'application/pdf' })
        })
        .mockRejectedValueOnce(new Error('File 2 failed'));

      const mixedFiles = createTestFilesWithId([
        { name: 'doc1.txt', content: 'file1', type: 'text/plain' },
        { name: 'doc2.xyz', content: 'file2', type: 'application/octet-stream' }
      ]);

      // Set up for separate processing (mixed smart detection)
      act(() => {
        paramsResult.current.analyzeFileTypes(mixedFiles);
      });

      await act(async () => {
        await operationResult.current.executeOperation(
          paramsResult.current.parameters,
          mixedFiles
        );
      });

      await waitFor(() => {
        // Should have processed at least one file successfully
        expect(operationResult.current.files.length).toBeGreaterThan(0);
        expect(mockedApiClient.post).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Real File Extension Detection', () => {

    test('should correctly detect various file extensions', async () => {
      renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });

      const testCases = [
        { filename: 'document.PDF', expected: 'pdf' },
        { filename: 'image.JPEG', expected: 'jpg' }, // JPEG should normalize to jpg
        { filename: 'photo.jpeg', expected: 'jpg' }, // jpeg should normalize to jpg
        { filename: 'archive.tar.gz', expected: 'gz' },
        { filename: 'file.', expected: '' },
        { filename: '.hidden', expected: 'hidden' },
        { filename: 'noextension', expected: '' }
      ];

      testCases.forEach(({ filename, expected }) => {
        const detected = detectFileExtension(filename);
        expect(detected).toBe(expected);
      });
    });
  });
});
