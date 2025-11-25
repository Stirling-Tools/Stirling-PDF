import { describe, it, expect } from 'vitest';
import { isPdfFile, detectFileExtension, formatFileSize } from './fileUtils';

describe('fileUtils', () => {
  describe('isPdfFile', () => {
    it('should return true for PDF files with correct MIME type', () => {
      const pdfFile = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      expect(isPdfFile(pdfFile)).toBe(true);
    });

    it('should return true for PDF files with .pdf extension even without MIME type', () => {
      const pdfFile = new File(['content'], 'document.pdf', { type: '' });
      expect(isPdfFile(pdfFile)).toBe(true);
    });

    it('should return false for non-PDF files', () => {
      const txtFile = new File(['content'], 'document.txt', { type: 'text/plain' });
      expect(isPdfFile(txtFile)).toBe(false);
    });

    it('should return false for image files', () => {
      const imageFile = new File(['content'], 'image.png', { type: 'image/png' });
      expect(isPdfFile(imageFile)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isPdfFile(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPdfFile(undefined)).toBe(false);
    });

    it('should handle file-like objects with name and type', () => {
      const fileLike = { name: 'test.pdf', type: 'application/pdf' };
      expect(isPdfFile(fileLike)).toBe(true);
    });

    it('should handle file-like objects with PDF extension but no type', () => {
      const fileLike = { name: 'test.pdf', type: '' };
      expect(isPdfFile(fileLike)).toBe(true);
    });
  });

  describe('detectFileExtension', () => {
    it('should detect PDF extension', () => {
      expect(detectFileExtension('document.pdf')).toBe('pdf');
    });

    it('should detect extension in uppercase', () => {
      expect(detectFileExtension('document.PDF')).toBe('pdf');
    });

    it('should return empty string for files without extension', () => {
      expect(detectFileExtension('document')).toBe('');
    });

    it('should handle multiple dots in filename', () => {
      expect(detectFileExtension('my.document.pdf')).toBe('pdf');
    });

    it('should normalize jpeg to jpg', () => {
      expect(detectFileExtension('image.jpeg')).toBe('jpg');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(2048)).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });
});
