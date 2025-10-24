/**
 * Unit tests for file response utility functions
 */

import { describe, test, expect } from 'vitest';
import { getFilenameFromHeaders, createFileFromApiResponse } from './fileResponseUtils';

describe('fileResponseUtils', () => {
  
  describe('getFilenameFromHeaders', () => {
    
    test('should extract filename from content-disposition header', () => {
      const contentDisposition = 'attachment; filename="document.pdf"';
      const filename = getFilenameFromHeaders(contentDisposition);
      
      expect(filename).toBe('document.pdf');
    });

    test('should extract filename without quotes', () => {
      const contentDisposition = 'attachment; filename=document.pdf';
      const filename = getFilenameFromHeaders(contentDisposition);
      
      expect(filename).toBe('document.pdf');
    });

    test('should handle single quotes', () => {
      const contentDisposition = "attachment; filename='document.pdf'";
      const filename = getFilenameFromHeaders(contentDisposition);
      
      expect(filename).toBe('document.pdf');
    });

    test('should return null for malformed header', () => {
      const contentDisposition = 'attachment; invalid=format';
      const filename = getFilenameFromHeaders(contentDisposition);
      
      expect(filename).toBe(null);
    });

    test('should return null for empty header', () => {
      const filename = getFilenameFromHeaders('');
      
      expect(filename).toBe(null);
    });

    test('should return null for undefined header', () => {
      const filename = getFilenameFromHeaders();
      
      expect(filename).toBe(null);
    });

    test('should handle complex filenames with spaces and special chars', () => {
      const contentDisposition = 'attachment; filename="My Document (1).pdf"';
      const filename = getFilenameFromHeaders(contentDisposition);
      
      expect(filename).toBe('My Document (1).pdf');
    });

    test('should handle filename with extension when downloadHtml is enabled', () => {
      const contentDisposition = 'attachment; filename="email_content.html"';
      const filename = getFilenameFromHeaders(contentDisposition);
      
      expect(filename).toBe('email_content.html');
    });
  });

  describe('createFileFromApiResponse', () => {
    
    test('should create file using header filename when available', () => {
      const responseData = new Uint8Array([1, 2, 3, 4]);
      const headers = {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="server_filename.pdf"'
      };
      const fallbackFilename = 'fallback.pdf';
      
      const file = createFileFromApiResponse(responseData, headers, fallbackFilename);
      
      expect(file.name).toBe('server_filename.pdf');
      expect(file.type).toBe('application/pdf');
      expect(file.size).toBe(4);
    });

    test('should use fallback filename when no header filename', () => {
      const responseData = new Uint8Array([1, 2, 3, 4]);
      const headers = {
        'content-type': 'application/pdf'
      };
      const fallbackFilename = 'converted_file.pdf';
      
      const file = createFileFromApiResponse(responseData, headers, fallbackFilename);
      
      expect(file.name).toBe('converted_file.pdf');
      expect(file.type).toBe('application/pdf');
    });

    test('should handle HTML response when downloadHtml is enabled', () => {
      const responseData = '<html><body>Test</body></html>';
      const headers = {
        'content-type': 'text/html',
        'content-disposition': 'attachment; filename="email_content.html"'
      };
      const fallbackFilename = 'fallback.pdf';
      
      const file = createFileFromApiResponse(responseData, headers, fallbackFilename);
      
      expect(file.name).toBe('email_content.html');
      expect(file.type).toBe('text/html');
    });

    test('should handle ZIP response', () => {
      const responseData = new Uint8Array([80, 75, 3, 4]); // ZIP file signature
      const headers = {
        'content-type': 'application/zip',
        'content-disposition': 'attachment; filename="converted_files.zip"'
      };
      const fallbackFilename = 'fallback.pdf';
      
      const file = createFileFromApiResponse(responseData, headers, fallbackFilename);
      
      expect(file.name).toBe('converted_files.zip');
      expect(file.type).toBe('application/zip');
    });

    test('should use default content-type when none provided', () => {
      const responseData = new Uint8Array([1, 2, 3, 4]);
      const headers = {};
      const fallbackFilename = 'test.bin';
      
      const file = createFileFromApiResponse(responseData, headers, fallbackFilename);
      
      expect(file.name).toBe('test.bin');
      expect(file.type).toBe('application/octet-stream');
    });

    test('should handle null/undefined headers gracefully', () => {
      const responseData = new Uint8Array([1, 2, 3, 4]);
      const headers = null;
      const fallbackFilename = 'test.bin';
      
      const file = createFileFromApiResponse(responseData, headers, fallbackFilename);
      
      expect(file.name).toBe('test.bin');
      expect(file.type).toBe('application/octet-stream');
    });
  });
});