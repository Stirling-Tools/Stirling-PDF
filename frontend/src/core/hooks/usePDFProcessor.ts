import { useState, useCallback } from 'react';
import { PDFDocument, PDFPage } from '@app/types/pageEditor';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { createQuickKey } from '@app/types/fileContext';

export function usePDFProcessor() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePageThumbnail = useCallback(async (
    file: File,
    pageNumber: number,
    scale: number = 0.5
  ): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfWorkerManager.createDocument(arrayBuffer);
      const page = await pdf.getPage(pageNumber);

      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not get canvas context');
      }

      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const thumbnail = canvas.toDataURL();

      // Clean up using worker manager
      pdfWorkerManager.destroyDocument(pdf);

      return thumbnail;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      throw error;
    }
  }, []);

  // Internal function to generate thumbnail from already-opened PDF
  const generateThumbnailFromPDF = useCallback(async (
    pdf: any,
    pageNumber: number,
    scale: number = 0.5
  ): Promise<string> => {
    const page = await pdf.getPage(pageNumber);

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas context');
    }

    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL();
  }, []);

  const processPDFFile = useCallback(async (file: File): Promise<PDFDocument> => {
    setLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfWorkerManager.createDocument(arrayBuffer);
      const totalPages = pdf.numPages;

      const pages: PDFPage[] = [];

      // Create pages without thumbnails initially - load them lazily
      for (let i = 1; i <= totalPages; i++) {
        pages.push({
          id: `${createQuickKey(file)}-page-${i}`,
          pageNumber: i,
          originalPageNumber: i,
          thumbnail: null, // Will be loaded lazily
          rotation: 0,
          selected: false
        });
      }

      // Generate thumbnails for first 10 pages immediately using the same PDF instance
      const priorityPages = Math.min(10, totalPages);
      for (let i = 1; i <= priorityPages; i++) {
        try {
          const thumbnail = await generateThumbnailFromPDF(pdf, i);
          pages[i - 1].thumbnail = thumbnail;
        } catch (error) {
          console.warn(`Failed to generate thumbnail for page ${i}:`, error);
        }
      }

      // Clean up using worker manager
      pdfWorkerManager.destroyDocument(pdf);

      const document: PDFDocument = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        file,
        pages,
        totalPages
      };

      return document;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process PDF';
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [generateThumbnailFromPDF]);

  return {
    processPDFFile,
    generatePageThumbnail,
    loading,
    error
  };
}
