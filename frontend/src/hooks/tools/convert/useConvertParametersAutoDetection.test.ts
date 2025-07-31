/**
 * Tests for auto-detection and smart conversion features in useConvertParameters
 * This covers the analyzeFileTypes function and related smart detection logic
 */

import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConvertParameters } from './useConvertParameters';

describe('useConvertParameters - Auto Detection & Smart Conversion', () => {
  
  describe('Single File Detection', () => {
    
    test('should detect single file extension and set auto-target', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const pdfFile = [{ name: 'document.pdf' }];
      
      act(() => {
        result.current.analyzeFileTypes(pdfFile);
      });
      
      expect(result.current.parameters.fromExtension).toBe('pdf');
      expect(result.current.parameters.toExtension).toBe(''); // No auto-selection for multiple targets
      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe('none');
    });

    test('should handle unknown file types with file-to-pdf fallback', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const unknownFile = [{ name: 'document.xyz' }];
      
      act(() => {
        result.current.analyzeFileTypes(unknownFile);
      });
      
      expect(result.current.parameters.fromExtension).toBe('any');
      expect(result.current.parameters.toExtension).toBe('pdf'); // Fallback to file-to-pdf
      expect(result.current.parameters.isSmartDetection).toBe(false);
    });

    test('should handle files without extensions', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const noExtFile = [{ name: 'document' }];
      
      act(() => {
        result.current.analyzeFileTypes(noExtFile);
      });
      
      expect(result.current.parameters.fromExtension).toBe('any');
      expect(result.current.parameters.toExtension).toBe('pdf'); // Fallback to file-to-pdf
    });
    
    test('should reset parameters when no files provided', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      // First set some parameters
      act(() => {
        result.current.analyzeFileTypes([{ name: 'test.pdf' }]);
      });
      
      // Then analyze empty file list
      act(() => {
        result.current.analyzeFileTypes([]);
      });
      
      expect(result.current.parameters.fromExtension).toBe('');
      expect(result.current.parameters.toExtension).toBe('');
      expect(result.current.parameters.isSmartDetection).toBe(false);
    });
  });
  
  describe('Multiple Identical Files', () => {
    
    test('should detect multiple PDF files and set auto-target', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const pdfFiles = [
        { name: 'doc1.pdf' },
        { name: 'doc2.pdf' },
        { name: 'doc3.pdf' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(pdfFiles);
      });
      
      expect(result.current.parameters.fromExtension).toBe('pdf');
      expect(result.current.parameters.toExtension).toBe(''); // Auto-selected
      expect(result.current.parameters.isSmartDetection).toBe(false);
      expect(result.current.parameters.smartDetectionType).toBe('none');
    });

    test('should handle multiple unknown file types with fallback', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const unknownFiles = [
        { name: 'file1.xyz' },
        { name: 'file2.xyz' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(unknownFiles);
      });
      
      expect(result.current.parameters.fromExtension).toBe('any');
      expect(result.current.parameters.toExtension).toBe('pdf');
      expect(result.current.parameters.isSmartDetection).toBe(false);
    });
  });
  
  describe('Smart Detection - All Images', () => {
    
    test('should detect all image files and enable smart detection', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const imageFiles = [
        { name: 'photo1.jpg' },
        { name: 'photo2.png' },
        { name: 'photo3.gif' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(imageFiles);
      });
      
      expect(result.current.parameters.fromExtension).toBe('image');
      expect(result.current.parameters.toExtension).toBe('pdf');
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('images');
    });

    test('should handle mixed case image extensions', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const imageFiles = [
        { name: 'photo1.JPG' },
        { name: 'photo2.PNG' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(imageFiles);
      });
      
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('images');
    });
  });
  
  describe('Smart Detection - All Web Files', () => {
    
    test('should detect all web files and enable web smart detection', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const webFiles = [
        { name: 'page1.html' },
        { name: 'archive.zip' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(webFiles);
      });
      
      expect(result.current.parameters.fromExtension).toBe('html');
      expect(result.current.parameters.toExtension).toBe('pdf');
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('web');
    });

    test('should handle mixed case web extensions', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const webFiles = [
        { name: 'page1.HTML' },
        { name: 'archive.ZIP' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(webFiles);
      });
      
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('web');
    });

    test('should detect multiple web files and enable web smart detection', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const zipFiles = [
        { name: 'site1.zip' },
        { name: 'site2.html' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(zipFiles);
      });
      
      expect(result.current.parameters.fromExtension).toBe('html');
      expect(result.current.parameters.toExtension).toBe('pdf');
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('web');
    });
  });
  
  describe('Smart Detection - Mixed File Types', () => {
    
    test('should detect mixed file types and enable smart detection', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const mixedFiles = [
        { name: 'document.pdf' },
        { name: 'spreadsheet.xlsx' },
        { name: 'presentation.pptx' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });
      
      expect(result.current.parameters.fromExtension).toBe('any');
      expect(result.current.parameters.toExtension).toBe('pdf');
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('mixed');
    });

    test('should detect mixed images and documents as mixed type', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const mixedFiles = [
        { name: 'photo.jpg' },
        { name: 'document.pdf' },
        { name: 'text.txt' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });
      
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('mixed');
    });

    test('should handle mixed with unknown file types', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const mixedFiles = [
        { name: 'document.pdf' },
        { name: 'unknown.xyz' },
        { name: 'noextension' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });
      
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('mixed');
    });
  });
  
  describe('Smart Detection Endpoint Resolution', () => {
    
    test('should return correct endpoint for image smart detection', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const imageFiles = [
        { name: 'photo1.jpg' },
        { name: 'photo2.png' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(imageFiles);
      });
      
      expect(result.current.getEndpointName()).toBe('img-to-pdf');
      expect(result.current.getEndpoint()).toBe('/api/v1/convert/img/pdf');
    });

    test('should return correct endpoint for web smart detection', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const webFiles = [
        { name: 'page1.html' },
        { name: 'archive.zip' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(webFiles);
      });
      
      expect(result.current.getEndpointName()).toBe('html-to-pdf');
      expect(result.current.getEndpoint()).toBe('/api/v1/convert/html/pdf');
    });

    test('should return correct endpoint for mixed smart detection', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const mixedFiles = [
        { name: 'document.pdf' },
        { name: 'spreadsheet.xlsx' }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(mixedFiles);
      });
      
      expect(result.current.getEndpointName()).toBe('file-to-pdf');
      expect(result.current.getEndpoint()).toBe('/api/v1/convert/file/pdf');
    });
  });
  
  describe('Auto-Target Selection Logic', () => {
    
    test('should select single available target automatically', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      // Markdown has only one conversion target (PDF)
      const mdFile = [{ name: 'readme.md' }];
      
      act(() => {
        result.current.analyzeFileTypes(mdFile);
      });
      
      expect(result.current.parameters.fromExtension).toBe('md');
      expect(result.current.parameters.toExtension).toBe('pdf'); // Only available target
    });

    test('should not auto-select when multiple targets available', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      // PDF has multiple conversion targets, so no auto-selection
      const pdfFile = [{ name: 'document.pdf' }];
      
      act(() => {
        result.current.analyzeFileTypes(pdfFile);
      });
      
      expect(result.current.parameters.fromExtension).toBe('pdf');
      // Should NOT auto-select when multiple targets available
      expect(result.current.parameters.toExtension).toBe('');
    });
  });
  
  describe('Edge Cases', () => {
    
    test('should handle empty file names', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const emptyFiles = [{ name: '' }];
      
      act(() => {
        result.current.analyzeFileTypes(emptyFiles);
      });
      
      expect(result.current.parameters.fromExtension).toBe('any');
      expect(result.current.parameters.toExtension).toBe('pdf');
    });

    test('should handle malformed file objects', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const malformedFiles = [
        { name: 'valid.pdf' },
        // @ts-ignore - Testing runtime resilience
        { name: null },
        // @ts-ignore
        { name: undefined }
      ];
      
      act(() => {
        result.current.analyzeFileTypes(malformedFiles);
      });
      
      // Should still process the valid file and handle gracefully
      expect(result.current.parameters.isSmartDetection).toBe(true);
      expect(result.current.parameters.smartDetectionType).toBe('mixed');
    });
  });
});