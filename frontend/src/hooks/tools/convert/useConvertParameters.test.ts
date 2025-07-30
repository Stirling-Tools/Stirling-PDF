/**
 * Unit tests for useConvertParameters hook
 */

import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConvertParameters } from './useConvertParameters';

describe('useConvertParameters', () => {
  
  describe('Parameter Management', () => {
    
    test('should initialize with default parameters', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      expect(result.current.parameters.fromExtension).toBe('');
      expect(result.current.parameters.toExtension).toBe('');
      expect(result.current.parameters.imageOptions.colorType).toBe('color');
      expect(result.current.parameters.imageOptions.dpi).toBe(300);
      expect(result.current.parameters.imageOptions.singleOrMultiple).toBe('multiple');
    });

    test('should update individual parameters', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('fromExtension', 'pdf');
      });
      
      expect(result.current.parameters.fromExtension).toBe('pdf');
      expect(result.current.parameters.toExtension).toBe(''); // Should not affect other params
    });

    test('should update nested image options', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('imageOptions', {
          colorType: 'grayscale',
          dpi: 150,
          singleOrMultiple: 'single'
        });
      });
      
      expect(result.current.parameters.imageOptions.colorType).toBe('grayscale');
      expect(result.current.parameters.imageOptions.dpi).toBe(150);
      expect(result.current.parameters.imageOptions.singleOrMultiple).toBe('single');
    });

    test('should reset parameters to defaults', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('fromExtension', 'pdf');
        result.current.updateParameter('toExtension', 'png');
      });
      
      expect(result.current.parameters.fromExtension).toBe('pdf');
      
      act(() => {
        result.current.resetParameters();
      });
      
      expect(result.current.parameters.fromExtension).toBe('');
      expect(result.current.parameters.toExtension).toBe('');
    });
  });

  describe('Parameter Validation', () => {
    
    test('should validate parameters correctly', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      // No parameters - should be invalid
      expect(result.current.validateParameters()).toBe(false);
      
      // Only fromExtension - should be invalid
      act(() => {
        result.current.updateParameter('fromExtension', 'pdf');
      });
      expect(result.current.validateParameters()).toBe(false);
      
      // Both extensions with supported conversion - should be valid
      act(() => {
        result.current.updateParameter('toExtension', 'png');
      });
      expect(result.current.validateParameters()).toBe(true);
    });

    test('should validate unsupported conversions', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('fromExtension', 'pdf');
        result.current.updateParameter('toExtension', 'unsupported');
      });
      
      expect(result.current.validateParameters()).toBe(false);
    });

    test('should validate DPI ranges for image conversions', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('fromExtension', 'pdf');
        result.current.updateParameter('toExtension', 'png');
        result.current.updateParameter('imageOptions', {
          colorType: 'color',
          dpi: 50, // Below minimum
          singleOrMultiple: 'multiple'
        });
      });
      
      expect(result.current.validateParameters()).toBe(false);
      
      act(() => {
        result.current.updateParameter('imageOptions', {
          colorType: 'color',
          dpi: 300, // Valid range
          singleOrMultiple: 'multiple'
        });
      });
      
      expect(result.current.validateParameters()).toBe(true);
      
      act(() => {
        result.current.updateParameter('imageOptions', {
          colorType: 'color',
          dpi: 700, // Above maximum
          singleOrMultiple: 'multiple'
        });
      });
      
      expect(result.current.validateParameters()).toBe(false);
    });
  });

  describe('Endpoint Generation', () => {
    
    test('should generate correct endpoint names', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('fromExtension', 'pdf');
        result.current.updateParameter('toExtension', 'png');
      });
      
      const endpointName = result.current.getEndpointName();
      expect(endpointName).toBe('pdf-to-img');
    });

    test('should generate correct endpoint URLs', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('fromExtension', 'pdf');
        result.current.updateParameter('toExtension', 'png');
      });
      
      const endpoint = result.current.getEndpoint();
      expect(endpoint).toBe('/api/v1/convert/pdf/img');
    });

    test('should return empty strings for invalid conversions', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('fromExtension', 'invalid');
        result.current.updateParameter('toExtension', 'invalid');
      });
      
      expect(result.current.getEndpointName()).toBe('');
      expect(result.current.getEndpoint()).toBe('');
    });
  });

  describe('Available Extensions', () => {
    
    test('should return available extensions for valid source format', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const availableExtensions = result.current.getAvailableToExtensions('pdf');
      
      expect(availableExtensions.length).toBeGreaterThan(0);
      expect(availableExtensions.some(ext => ext.value === 'png')).toBe(true);
      expect(availableExtensions.some(ext => ext.value === 'jpg')).toBe(true);
    });

    test('should return empty array for invalid source format', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const availableExtensions = result.current.getAvailableToExtensions('invalid');
      
      expect(availableExtensions).toEqual([{
        "group": "Document",
        "label": "PDF",
        "value": "pdf",
      }]);
    });

    test('should return empty array for empty source format', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      const availableExtensions = result.current.getAvailableToExtensions('');
      
      expect(availableExtensions).toEqual([]);
    });
  });

  describe('File Extension Detection', () => {
    
    test('should detect file extensions correctly', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      expect(result.current.detectFileExtension('document.pdf')).toBe('pdf');
      expect(result.current.detectFileExtension('image.PNG')).toBe('png'); // Should lowercase
      expect(result.current.detectFileExtension('file.docx')).toBe('docx');
      expect(result.current.detectFileExtension('archive.tar.gz')).toBe('gz'); // Last extension
    });

    test('should handle files without extensions', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      // Files without extensions should return empty string
      expect(result.current.detectFileExtension('noextension')).toBe('');
      expect(result.current.detectFileExtension('')).toBe('');
    });

    test('should handle edge cases', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      expect(result.current.detectFileExtension('file.')).toBe('');
      expect(result.current.detectFileExtension('.hidden')).toBe('hidden');
      expect(result.current.detectFileExtension('file.UPPER')).toBe('upper');
    });
  });
});