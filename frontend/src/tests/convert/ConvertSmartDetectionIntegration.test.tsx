/**
 * Integration tests for Convert Tool Smart Detection with real file scenarios
 * Tests the complete flow from file upload through auto-detection to API calls
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConvertOperation } from '../../hooks/tools/convert/useConvertOperation';
import { useConvertParameters } from '../../hooks/tools/convert/useConvertParameters';
import { FileContextProvider } from '../../contexts/FileContext';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/config';
import axios from 'axios';
import { detectFileExtension } from '../../utils/fileUtils';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock utility modules
vi.mock('../../utils/thumbnailUtils', () => ({
  generateThumbnailForFile: vi.fn().mockResolvedValue('data:image/png;base64,fake-thumbnail')
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <FileContextProvider>
      {children}
    </FileContextProvider>
  </I18nextProvider>
);

describe('Convert Tool - Smart Detection Integration Tests', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful API response
    mockedAxios.post.mockResolvedValue({
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
      const docxFile = new File(['docx content'], 'document.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      
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
      
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/v1/convert/file/pdf', expect.any(FormData), {
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
      const unknownFile = new File(['unknown content'], 'document.xyz', { type: 'application/octet-stream' });
      
      // Test auto-detection
      act(() => {
        paramsResult.current.analyzeFileTypes([unknownFile]);
      });
      
      await waitFor(() => {
        expect(paramsResult.current.parameters.fromExtension).toBe('any');
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
      
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/v1/convert/file/pdf', expect.any(FormData), {
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
      const imageFiles = [
        new File(['jpg content'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['png content'], 'photo2.png', { type: 'image/png' }),
        new File(['gif content'], 'photo3.gif', { type: 'image/gif' })
      ];
      
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
      
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/v1/convert/img/pdf', expect.any(FormData), {
        responseType: 'blob'
      });
      
      // Should send all files in single request
      const formData = mockedAxios.post.mock.calls[0][1] as FormData;
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
      const mixedFiles = [
        new File(['pdf content'], 'document.pdf', { type: 'application/pdf' }),
        new File(['docx content'], 'spreadsheet.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        new File(['pptx content'], 'presentation.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
      ];
      
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
      
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/v1/convert/file/pdf', expect.any(FormData), {
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
      const webFiles = [
        new File(['<html>content</html>'], 'page1.html', { type: 'text/html' }),
        new File(['zip content'], 'site.zip', { type: 'application/zip' })
      ];
      
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
      
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/v1/convert/html/pdf', expect.any(FormData), {
        responseType: 'blob'
      });
      
      // Should process files separately for web files
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
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
      
      const htmlFile = new File(['<html>content</html>'], 'page.html', { type: 'text/html' });
      
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
      
      const formData = mockedAxios.post.mock.calls[0][1] as FormData;
      expect(formData.get('zoom')).toBe('1.5');
    });

    test('should send correct email parameters for eml-to-pdf conversion', async () => {
      const { result: paramsResult } = renderHook(() => useConvertParameters(), {
        wrapper: TestWrapper
      });
      
      const { result: operationResult } = renderHook(() => useConvertOperation(), {
        wrapper: TestWrapper
      });
      
      const emlFile = new File(['email content'], 'email.eml', { type: 'message/rfc822' });
      
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
      
      const formData = mockedAxios.post.mock.calls[0][1] as FormData;
      expect(formData.get('includeAttachments')).toBe('false');
      expect(formData.get('maxAttachmentSizeMB')).toBe('20');
      expect(formData.get('downloadHtml')).toBe('true');
      expect(formData.get('includeAllRecipients')).toBe('true');
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
      
      const imageFiles = [
        new File(['jpg1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['jpg2'], 'photo2.jpg', { type: 'image/jpeg' })
      ];
      
      // Set up image conversion parameters
      act(() => {
        paramsResult.current.analyzeFileTypes(imageFiles);
        paramsResult.current.updateParameter('imageOptions', {
          colorType: 'grayscale',
          dpi: 150,
          singleOrMultiple: 'single',
          fitOption: 'fitToPage',
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
      
      const formData = mockedAxios.post.mock.calls[0][1] as FormData;
      expect(formData.get('fitOption')).toBe('fitToPage');
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
      
      const imageFiles = [
        new File(['jpg1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['jpg2'], 'photo2.jpg', { type: 'image/jpeg' })
      ];
      
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
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
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
      mockedAxios.post
        .mockResolvedValueOnce({
          data: new Blob(['converted1'], { type: 'application/pdf' })
        })
        .mockRejectedValueOnce(new Error('File 2 failed'));
      
      const mixedFiles = [
        new File(['file1'], 'doc1.txt', { type: 'text/plain' }),
        new File(['file2'], 'doc2.xyz', { type: 'application/octet-stream' })
      ];
      
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
        expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Real File Extension Detection', () => {
    
    test('should correctly detect various file extensions', async () => {
      const { result } = renderHook(() => useConvertParameters(), {
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