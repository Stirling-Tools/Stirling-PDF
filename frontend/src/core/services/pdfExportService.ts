import { PDFDocument as PDFLibDocument, degrees, PageSizes } from 'pdf-lib';
import { downloadFile } from '@app/services/downloadService';
import { PDFDocument, PDFPage } from '@app/types/pageEditor';

export interface ExportOptions {
  selectedOnly?: boolean;
  filename?: string;
}

export class PDFExportService {
  /**
   * Export PDF document with applied operations (single file source)
   */
  async exportPDF(
    pdfDocument: PDFDocument,
    selectedPageIds: string[] = [],
    options: ExportOptions = {}
  ): Promise<{ blob: Blob; filename: string }> {
    const { selectedOnly = false, filename } = options;

    try {
      // Determine which pages to export
      const pagesToExport = selectedOnly && selectedPageIds.length > 0
        ? pdfDocument.pages.filter(page => selectedPageIds.includes(page.id))
        : pdfDocument.pages;

      if (pagesToExport.length === 0) {
        throw new Error('No pages to export');
      }

      // Load original PDF and create new document
      const originalPDFBytes = await pdfDocument.file.arrayBuffer();
      const sourceDoc = await PDFLibDocument.load(originalPDFBytes, { ignoreEncryption: true });
      const blob = await this.createSingleDocument(sourceDoc, pagesToExport);
      const exportFilename = this.generateFilename(filename || pdfDocument.name);

      return { blob, filename: exportFilename };
    } catch (error) {
      console.error('PDF export error:', error);
      throw new Error(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export PDF document with applied operations (multi-file source)
   */
  async exportPDFMultiFile(
    pdfDocument: PDFDocument,
    sourceFiles: Map<string, File>,
    selectedPageIds: string[] = [],
    options: ExportOptions = {}
  ): Promise<{ blob: Blob; filename: string }> {
    const { selectedOnly = false, filename } = options;

    try {
      // Determine which pages to export
      const pagesToExport = selectedOnly && selectedPageIds.length > 0
        ? pdfDocument.pages.filter(page => selectedPageIds.includes(page.id))
        : pdfDocument.pages;

      if (pagesToExport.length === 0) {
        throw new Error('No pages to export');
      }

      const blob = await this.createMultiSourceDocument(sourceFiles, pagesToExport);
      const exportFilename = this.generateFilename(filename || pdfDocument.name);

      return { blob, filename: exportFilename };
    } catch (error) {
      console.error('Multi-file PDF export error:', error);
      throw new Error(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a PDF document from multiple source files
   */
  private async createMultiSourceDocument(
    sourceFiles: Map<string, File>,
    pages: PDFPage[]
  ): Promise<Blob> {
    const newDoc = await PDFLibDocument.create();

    // Load all source documents once and cache them
    const loadedDocs = new Map<string, PDFLibDocument>();

    for (const [fileId, file] of sourceFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await PDFLibDocument.load(arrayBuffer, { ignoreEncryption: true });
        loadedDocs.set(fileId, doc);
      } catch (error) {
        console.warn(`Failed to load source file ${fileId}:`, error);
      }
    }

    for (const page of pages) {
      if (page.isBlankPage || page.originalPageNumber === -1) {
        // Create a blank page
        const blankPage = newDoc.addPage(PageSizes.A4);

        blankPage.setRotation(degrees(page.rotation));
      } else if (page.originalFileId && loadedDocs.has(page.originalFileId)) {
        // Get the correct source document for this page
        const sourceDoc = loadedDocs.get(page.originalFileId)!;
        const sourcePageIndex = page.originalPageNumber - 1;

        if (sourcePageIndex >= 0 && sourcePageIndex < sourceDoc.getPageCount()) {
          // Copy the page from the correct source document
          const [copiedPage] = await newDoc.copyPages(sourceDoc, [sourcePageIndex]);

          copiedPage.setRotation(degrees(page.rotation));

          newDoc.addPage(copiedPage);
        }
      } else {
        console.warn(`Cannot find source document for page ${page.pageNumber} (fileId: ${page.originalFileId})`);
      }
    }

    // Set metadata
    newDoc.setCreator('Stirling PDF');
    newDoc.setProducer('Stirling PDF');
    newDoc.setCreationDate(new Date());
    newDoc.setModificationDate(new Date());

    const pdfBytes = await newDoc.save();
    return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  }

  /**
   * Create a single PDF document with all operations applied (single source)
   */
  private async createSingleDocument(
    sourceDoc: PDFLibDocument,
    pages: PDFPage[]
  ): Promise<Blob> {
    const newDoc = await PDFLibDocument.create();

    for (const page of pages) {
      if (page.isBlankPage || page.originalPageNumber === -1) {
        // Create a blank page
        const blankPage = newDoc.addPage(PageSizes.A4);

        blankPage.setRotation(degrees(page.rotation));
      } else {
        // Get the original page from source document using originalPageNumber
        const sourcePageIndex = page.originalPageNumber - 1;

        if (sourcePageIndex >= 0 && sourcePageIndex < sourceDoc.getPageCount()) {
          // Copy the page
          const [copiedPage] = await newDoc.copyPages(sourceDoc, [sourcePageIndex]);

          copiedPage.setRotation(degrees(page.rotation));

          newDoc.addPage(copiedPage);
        }
      }
    }

    // Set metadata
    newDoc.setCreator('Stirling PDF');
    newDoc.setProducer('Stirling PDF');
    newDoc.setCreationDate(new Date());
    newDoc.setModificationDate(new Date());

    const pdfBytes = await newDoc.save();
    return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  }


  /**
   * Generate appropriate filename for export
   */
  private generateFilename(originalName: string): string {
    const baseName = originalName.replace(/\.pdf$/i, '');
    return `${baseName}.pdf`;
  }


  /**
   * Download a single file
   */
  downloadFile(blob: Blob, filename: string): void {
    void downloadFile({ data: blob, filename });
  }

  /**
   * Download multiple files as a ZIP
   */
  async downloadAsZip(blobs: Blob[], filenames: string[]): Promise<void> {
    blobs.forEach((blob, index) => {
      setTimeout(() => {
        this.downloadFile(blob, filenames[index]);
      }, index * 500); // Stagger downloads
    });
  }

  /**
   * Validate PDF operations before export
   */
  validateExport(pdfDocument: PDFDocument, selectedPageIds: string[], selectedOnly: boolean): string[] {
    const errors: string[] = [];

    if (selectedOnly && selectedPageIds.length === 0) {
      errors.push('No pages selected for export');
    }

    if (pdfDocument.pages.length === 0) {
      errors.push('No pages available to export');
    }

    const pagesToExport = selectedOnly
      ? pdfDocument.pages.filter(page => selectedPageIds.includes(page.id))
      : pdfDocument.pages;

    if (pagesToExport.length === 0) {
      errors.push('No valid pages to export after applying filters');
    }

    return errors;
  }

  /**
   * Get export preview information
   */
  getExportInfo(pdfDocument: PDFDocument, selectedPageIds: string[], selectedOnly: boolean): {
    pageCount: number;
    splitCount: number;
    estimatedSize: string;
  } {
    const pagesToExport = selectedOnly
      ? pdfDocument.pages.filter(page => selectedPageIds.includes(page.id))
      : pdfDocument.pages;

    const splitCount = pagesToExport.reduce((count, page) => {
      return count + (page.splitAfter ? 1 : 0);
    }, 1); // At least 1 document

    // Rough size estimation (very approximate)
    const avgPageSize = pdfDocument.file.size / pdfDocument.totalPages;
    const estimatedBytes = avgPageSize * pagesToExport.length;
    const estimatedSize = this.formatFileSize(estimatedBytes);

    return {
      pageCount: pagesToExport.length,
      splitCount,
      estimatedSize
    };
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const pdfExportService = new PDFExportService();
