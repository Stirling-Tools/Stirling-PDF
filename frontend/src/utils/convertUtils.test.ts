/**
 * Unit tests for convertUtils
 */

import { describe, test, expect } from 'vitest';
import { 
  getEndpointName, 
  getEndpointUrl, 
  isConversionSupported, 
  isImageFormat 
} from './convertUtils';

describe('convertUtils', () => {
  
  describe('getEndpointName', () => {
    
    test('should return correct endpoint names for all supported conversions', () => {
      // PDF to Image formats
      expect(getEndpointName('pdf', 'png')).toBe('pdf-to-img');
      expect(getEndpointName('pdf', 'jpg')).toBe('pdf-to-img');
      expect(getEndpointName('pdf', 'gif')).toBe('pdf-to-img');
      expect(getEndpointName('pdf', 'tiff')).toBe('pdf-to-img');
      expect(getEndpointName('pdf', 'bmp')).toBe('pdf-to-img');
      expect(getEndpointName('pdf', 'webp')).toBe('pdf-to-img');
      
      // PDF to Office formats
      expect(getEndpointName('pdf', 'docx')).toBe('pdf-to-word');
      expect(getEndpointName('pdf', 'odt')).toBe('pdf-to-word');
      expect(getEndpointName('pdf', 'pptx')).toBe('pdf-to-presentation');
      expect(getEndpointName('pdf', 'odp')).toBe('pdf-to-presentation');
      
      // PDF to Data formats
      expect(getEndpointName('pdf', 'csv')).toBe('pdf-to-csv');
      expect(getEndpointName('pdf', 'txt')).toBe('pdf-to-text');
      expect(getEndpointName('pdf', 'rtf')).toBe('pdf-to-text');
      expect(getEndpointName('pdf', 'md')).toBe('pdf-to-markdown');
      
      // PDF to Web formats
      expect(getEndpointName('pdf', 'html')).toBe('pdf-to-html');
      expect(getEndpointName('pdf', 'xml')).toBe('pdf-to-xml');
      
      // PDF to PDF/A
      expect(getEndpointName('pdf', 'pdfa')).toBe('pdf-to-pdfa');
      
      // Office Documents to PDF
      expect(getEndpointName('docx', 'pdf')).toBe('file-to-pdf');
      expect(getEndpointName('doc', 'pdf')).toBe('file-to-pdf');
      expect(getEndpointName('odt', 'pdf')).toBe('file-to-pdf');
      
      // Spreadsheets to PDF
      expect(getEndpointName('xlsx', 'pdf')).toBe('file-to-pdf');
      expect(getEndpointName('xls', 'pdf')).toBe('file-to-pdf');
      expect(getEndpointName('ods', 'pdf')).toBe('file-to-pdf');
      
      // Presentations to PDF
      expect(getEndpointName('pptx', 'pdf')).toBe('file-to-pdf');
      expect(getEndpointName('ppt', 'pdf')).toBe('file-to-pdf');
      expect(getEndpointName('odp', 'pdf')).toBe('file-to-pdf');
      
      // Images to PDF
      expect(getEndpointName('jpg', 'pdf')).toBe('img-to-pdf');
      expect(getEndpointName('jpeg', 'pdf')).toBe('img-to-pdf');
      expect(getEndpointName('png', 'pdf')).toBe('img-to-pdf');
      expect(getEndpointName('gif', 'pdf')).toBe('img-to-pdf');
      expect(getEndpointName('bmp', 'pdf')).toBe('img-to-pdf');
      expect(getEndpointName('tiff', 'pdf')).toBe('img-to-pdf');
      expect(getEndpointName('webp', 'pdf')).toBe('img-to-pdf');
      
      // Web formats to PDF
      expect(getEndpointName('html', 'pdf')).toBe('html-to-pdf');
      expect(getEndpointName('htm', 'pdf')).toBe('html-to-pdf');
      
      // Markdown to PDF
      expect(getEndpointName('md', 'pdf')).toBe('markdown-to-pdf');
      
      // Text formats to PDF
      expect(getEndpointName('txt', 'pdf')).toBe('file-to-pdf');
      expect(getEndpointName('rtf', 'pdf')).toBe('file-to-pdf');
      
      // Email to PDF
      expect(getEndpointName('eml', 'pdf')).toBe('eml-to-pdf');
    });

    test('should return empty string for unsupported conversions', () => {
      expect(getEndpointName('pdf', 'exe')).toBe('');
      expect(getEndpointName('wav', 'pdf')).toBe('');
      expect(getEndpointName('png', 'docx')).toBe(''); // Images can't convert to Word docs
    });

    test('should handle empty or invalid inputs', () => {
      expect(getEndpointName('', '')).toBe('');
      expect(getEndpointName('pdf', '')).toBe('');
      expect(getEndpointName('', 'pdf')).toBe('');
      expect(getEndpointName('nonexistent', 'alsononexistent')).toBe('');
    });
  });

  describe('getEndpointUrl', () => {
    
    test('should return correct endpoint URLs for all supported conversions', () => {
      // PDF to Image formats
      expect(getEndpointUrl('pdf', 'png')).toBe('/api/v1/convert/pdf/img');
      expect(getEndpointUrl('pdf', 'jpg')).toBe('/api/v1/convert/pdf/img');
      expect(getEndpointUrl('pdf', 'gif')).toBe('/api/v1/convert/pdf/img');
      expect(getEndpointUrl('pdf', 'tiff')).toBe('/api/v1/convert/pdf/img');
      expect(getEndpointUrl('pdf', 'bmp')).toBe('/api/v1/convert/pdf/img');
      expect(getEndpointUrl('pdf', 'webp')).toBe('/api/v1/convert/pdf/img');
      
      // PDF to Office formats
      expect(getEndpointUrl('pdf', 'docx')).toBe('/api/v1/convert/pdf/word');
      expect(getEndpointUrl('pdf', 'odt')).toBe('/api/v1/convert/pdf/word');
      expect(getEndpointUrl('pdf', 'pptx')).toBe('/api/v1/convert/pdf/presentation');
      expect(getEndpointUrl('pdf', 'odp')).toBe('/api/v1/convert/pdf/presentation');
      
      // PDF to Data formats
      expect(getEndpointUrl('pdf', 'csv')).toBe('/api/v1/convert/pdf/csv');
      expect(getEndpointUrl('pdf', 'txt')).toBe('/api/v1/convert/pdf/text');
      expect(getEndpointUrl('pdf', 'rtf')).toBe('/api/v1/convert/pdf/text');
      expect(getEndpointUrl('pdf', 'md')).toBe('/api/v1/convert/pdf/markdown');
      
      // PDF to Web formats
      expect(getEndpointUrl('pdf', 'html')).toBe('/api/v1/convert/pdf/html');
      expect(getEndpointUrl('pdf', 'xml')).toBe('/api/v1/convert/pdf/xml');
      
      // PDF to PDF/A
      expect(getEndpointUrl('pdf', 'pdfa')).toBe('/api/v1/convert/pdf/pdfa');
      
      // Office Documents to PDF
      expect(getEndpointUrl('docx', 'pdf')).toBe('/api/v1/convert/file/pdf');
      expect(getEndpointUrl('doc', 'pdf')).toBe('/api/v1/convert/file/pdf');
      expect(getEndpointUrl('odt', 'pdf')).toBe('/api/v1/convert/file/pdf');
      
      // Spreadsheets to PDF
      expect(getEndpointUrl('xlsx', 'pdf')).toBe('/api/v1/convert/file/pdf');
      expect(getEndpointUrl('xls', 'pdf')).toBe('/api/v1/convert/file/pdf');
      expect(getEndpointUrl('ods', 'pdf')).toBe('/api/v1/convert/file/pdf');
      
      // Presentations to PDF
      expect(getEndpointUrl('pptx', 'pdf')).toBe('/api/v1/convert/file/pdf');
      expect(getEndpointUrl('ppt', 'pdf')).toBe('/api/v1/convert/file/pdf');
      expect(getEndpointUrl('odp', 'pdf')).toBe('/api/v1/convert/file/pdf');
      
      // Images to PDF
      expect(getEndpointUrl('jpg', 'pdf')).toBe('/api/v1/convert/img/pdf');
      expect(getEndpointUrl('jpeg', 'pdf')).toBe('/api/v1/convert/img/pdf');
      expect(getEndpointUrl('png', 'pdf')).toBe('/api/v1/convert/img/pdf');
      expect(getEndpointUrl('gif', 'pdf')).toBe('/api/v1/convert/img/pdf');
      expect(getEndpointUrl('bmp', 'pdf')).toBe('/api/v1/convert/img/pdf');
      expect(getEndpointUrl('tiff', 'pdf')).toBe('/api/v1/convert/img/pdf');
      expect(getEndpointUrl('webp', 'pdf')).toBe('/api/v1/convert/img/pdf');
      
      // Web formats to PDF
      expect(getEndpointUrl('html', 'pdf')).toBe('/api/v1/convert/html/pdf');
      expect(getEndpointUrl('htm', 'pdf')).toBe('/api/v1/convert/html/pdf');
      
      // Markdown to PDF
      expect(getEndpointUrl('md', 'pdf')).toBe('/api/v1/convert/markdown/pdf');
      
      // Text formats to PDF
      expect(getEndpointUrl('txt', 'pdf')).toBe('/api/v1/convert/file/pdf');
      expect(getEndpointUrl('rtf', 'pdf')).toBe('/api/v1/convert/file/pdf');
      
      // Email to PDF
      expect(getEndpointUrl('eml', 'pdf')).toBe('/api/v1/convert/eml/pdf');
    });

    test('should return empty string for unsupported conversions', () => {
      expect(getEndpointUrl('pdf', 'exe')).toBe('');
      expect(getEndpointUrl('wav', 'pdf')).toBe('');
      expect(getEndpointUrl('invalid', 'invalid')).toBe('');
    });

    test('should handle empty inputs', () => {
      expect(getEndpointUrl('', '')).toBe('');
      expect(getEndpointUrl('pdf', '')).toBe('');
      expect(getEndpointUrl('', 'pdf')).toBe('');
    });
  });

  describe('isConversionSupported', () => {
    
    test('should return true for all supported conversions', () => {
      // PDF to Image formats
      expect(isConversionSupported('pdf', 'png')).toBe(true);
      expect(isConversionSupported('pdf', 'jpg')).toBe(true);
      expect(isConversionSupported('pdf', 'gif')).toBe(true);
      expect(isConversionSupported('pdf', 'tiff')).toBe(true);
      expect(isConversionSupported('pdf', 'bmp')).toBe(true);
      expect(isConversionSupported('pdf', 'webp')).toBe(true);
      
      // PDF to Office formats
      expect(isConversionSupported('pdf', 'docx')).toBe(true);
      expect(isConversionSupported('pdf', 'odt')).toBe(true);
      expect(isConversionSupported('pdf', 'pptx')).toBe(true);
      expect(isConversionSupported('pdf', 'odp')).toBe(true);
      
      // PDF to Data formats
      expect(isConversionSupported('pdf', 'csv')).toBe(true);
      expect(isConversionSupported('pdf', 'txt')).toBe(true);
      expect(isConversionSupported('pdf', 'rtf')).toBe(true);
      expect(isConversionSupported('pdf', 'md')).toBe(true);
      
      // PDF to Web formats
      expect(isConversionSupported('pdf', 'html')).toBe(true);
      expect(isConversionSupported('pdf', 'xml')).toBe(true);
      
      // PDF to PDF/A
      expect(isConversionSupported('pdf', 'pdfa')).toBe(true);
      
      // Office Documents to PDF
      expect(isConversionSupported('docx', 'pdf')).toBe(true);
      expect(isConversionSupported('doc', 'pdf')).toBe(true);
      expect(isConversionSupported('odt', 'pdf')).toBe(true);
      
      // Spreadsheets to PDF
      expect(isConversionSupported('xlsx', 'pdf')).toBe(true);
      expect(isConversionSupported('xls', 'pdf')).toBe(true);
      expect(isConversionSupported('ods', 'pdf')).toBe(true);
      
      // Presentations to PDF
      expect(isConversionSupported('pptx', 'pdf')).toBe(true);
      expect(isConversionSupported('ppt', 'pdf')).toBe(true);
      expect(isConversionSupported('odp', 'pdf')).toBe(true);
      
      // Images to PDF
      expect(isConversionSupported('jpg', 'pdf')).toBe(true);
      expect(isConversionSupported('jpeg', 'pdf')).toBe(true);
      expect(isConversionSupported('png', 'pdf')).toBe(true);
      expect(isConversionSupported('gif', 'pdf')).toBe(true);
      expect(isConversionSupported('bmp', 'pdf')).toBe(true);
      expect(isConversionSupported('tiff', 'pdf')).toBe(true);
      expect(isConversionSupported('webp', 'pdf')).toBe(true);
      
      // Web formats to PDF
      expect(isConversionSupported('html', 'pdf')).toBe(true);
      expect(isConversionSupported('htm', 'pdf')).toBe(true);
      
      // Markdown to PDF
      expect(isConversionSupported('md', 'pdf')).toBe(true);
      
      // Text formats to PDF
      expect(isConversionSupported('txt', 'pdf')).toBe(true);
      expect(isConversionSupported('rtf', 'pdf')).toBe(true);
      
      // Email to PDF
      expect(isConversionSupported('eml', 'pdf')).toBe(true);
    });

    test('should return false for unsupported conversions', () => {
      expect(isConversionSupported('pdf', 'exe')).toBe(false);
      expect(isConversionSupported('wav', 'pdf')).toBe(false);
      expect(isConversionSupported('png', 'docx')).toBe(false);
      expect(isConversionSupported('nonexistent', 'alsononexistent')).toBe(false);
    });

    test('should handle empty inputs', () => {
      expect(isConversionSupported('', '')).toBe(false);
      expect(isConversionSupported('pdf', '')).toBe(false);
      expect(isConversionSupported('', 'pdf')).toBe(false);
    });
  });

  describe('isImageFormat', () => {
    
    test('should return true for image formats', () => {
      expect(isImageFormat('png')).toBe(true);
      expect(isImageFormat('jpg')).toBe(true);
      expect(isImageFormat('jpeg')).toBe(true);
      expect(isImageFormat('gif')).toBe(true);
      expect(isImageFormat('tiff')).toBe(true);
      expect(isImageFormat('bmp')).toBe(true);
      expect(isImageFormat('webp')).toBe(true);
    });

    test('should return false for non-image formats', () => {
      expect(isImageFormat('pdf')).toBe(false);
      expect(isImageFormat('docx')).toBe(false);
      expect(isImageFormat('txt')).toBe(false);
      expect(isImageFormat('csv')).toBe(false);
      expect(isImageFormat('html')).toBe(false);
      expect(isImageFormat('xml')).toBe(false);
    });

    test('should handle case insensitivity', () => {
      expect(isImageFormat('PNG')).toBe(true);
      expect(isImageFormat('JPG')).toBe(true);
      expect(isImageFormat('JPEG')).toBe(true);
      expect(isImageFormat('Png')).toBe(true);
      expect(isImageFormat('JpG')).toBe(true);
    });

    test('should handle empty and invalid inputs', () => {
      expect(isImageFormat('')).toBe(false);
      expect(isImageFormat('invalid')).toBe(false);
      expect(isImageFormat('123')).toBe(false);
      expect(isImageFormat('.')).toBe(false);
    });

    test('should handle mixed case and edge cases', () => {
      expect(isImageFormat('webP')).toBe(true);
      expect(isImageFormat('WEBP')).toBe(true);
      expect(isImageFormat('tIFf')).toBe(true);
      expect(isImageFormat('bMp')).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    
    test('should handle null and undefined inputs gracefully', () => {
      // Note: TypeScript prevents these, but test runtime behavior for robustness
      // The current implementation handles these gracefully by returning falsy values
      expect(getEndpointName(null as any, null as any)).toBe('');
      expect(getEndpointUrl(undefined as any, undefined as any)).toBe('');
      expect(isConversionSupported(null as any, null as any)).toBe(false);
      
      // isImageFormat will throw because it calls toLowerCase() on null/undefined
      expect(() => isImageFormat(null as any)).toThrow();
      expect(() => isImageFormat(undefined as any)).toThrow();
    });

    test('should handle special characters in file extensions', () => {
      expect(isImageFormat('png@')).toBe(false);
      expect(isImageFormat('jpg#')).toBe(false);
      expect(isImageFormat('png.')).toBe(false);
      expect(getEndpointName('pdf@', 'png')).toBe('');
      expect(getEndpointName('pdf', 'png#')).toBe('');
    });

    test('should handle very long extension names', () => {
      const longExtension = 'a'.repeat(100);
      expect(isImageFormat(longExtension)).toBe(false);
      expect(getEndpointName('pdf', longExtension)).toBe('');
      expect(getEndpointName(longExtension, 'pdf')).toBe('');
    });
  });
});