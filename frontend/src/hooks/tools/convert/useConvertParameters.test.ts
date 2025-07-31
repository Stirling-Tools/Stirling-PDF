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
      expect(result.current.parameters.htmlOptions.zoomLevel).toBe(1.0);
      expect(result.current.parameters.emailOptions.includeAttachments).toBe(true);
      expect(result.current.parameters.emailOptions.maxAttachmentSizeMB).toBe(10);
      expect(result.current.parameters.emailOptions.downloadHtml).toBe(false);
      expect(result.current.parameters.emailOptions.includeAllRecipients).toBe(false);
      expect(result.current.parameters.pdfaOptions.outputFormat).toBe('pdfa-1');
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

    test('should update nested HTML options', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('htmlOptions', {
          zoomLevel: 1.5
        });
      });
      
      expect(result.current.parameters.htmlOptions.zoomLevel).toBe(1.5);
    });

    test('should update nested email options', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('emailOptions', {
          includeAttachments: false,
          maxAttachmentSizeMB: 20,
          downloadHtml: true,
          includeAllRecipients: true
        });
      });
      
      expect(result.current.parameters.emailOptions.includeAttachments).toBe(false);
      expect(result.current.parameters.emailOptions.maxAttachmentSizeMB).toBe(20);
      expect(result.current.parameters.emailOptions.downloadHtml).toBe(true);
      expect(result.current.parameters.emailOptions.includeAllRecipients).toBe(true);
    });

    test('should update nested PDF/A options', () => {
      const { result } = renderHook(() => useConvertParameters());
      
      act(() => {
        result.current.updateParameter('pdfaOptions', {
          outputFormat: 'pdfa'
        });
      });
      
      expect(result.current.parameters.pdfaOptions.outputFormat).toBe('pdfa');
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

});