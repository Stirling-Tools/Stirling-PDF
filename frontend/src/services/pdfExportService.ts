import { PDFDocument as PDFLibDocument, degrees, PageSizes } from 'pdf-lib';
import { PDFDocument, PDFPage } from '../types/pageEditor';

export interface ExportOptions {
  selectedOnly?: boolean;
  filename?: string;
}

export class PDFExportService {
  /**
   * Export PDF document with applied operations
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
      const sourceDoc = await PDFLibDocument.load(originalPDFBytes);
      const blob = await this.createSingleDocument(sourceDoc, pagesToExport);
      const exportFilename = this.generateFilename(filename || pdfDocument.name, selectedOnly);
      
      return { blob, filename: exportFilename };
    } catch (error) {
      console.error('PDF export error:', error);
      throw new Error(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a single PDF document with all operations applied
   */
  private async createSingleDocument(
    sourceDoc: PDFLibDocument,
    pages: PDFPage[]
  ): Promise<Blob> {
    const newDoc = await PDFLibDocument.create();

    for (const page of pages) {
      // Get the original page from source document using originalPageNumber
      const sourcePageIndex = page.originalPageNumber - 1;

      if (sourcePageIndex >= 0 && sourcePageIndex < sourceDoc.getPageCount()) {
        // Copy the page
        const [copiedPage] = await newDoc.copyPages(sourceDoc, [sourcePageIndex]);

        // Apply rotation
        if (page.rotation !== 0) {
          copiedPage.setRotation(degrees(page.rotation));
        }

        newDoc.addPage(copiedPage);
      }
    }

    // Set metadata
    newDoc.setCreator('Stirling PDF');
    newDoc.setProducer('Stirling PDF');
    newDoc.setCreationDate(new Date());
    newDoc.setModificationDate(new Date());

    const pdfBytes = await newDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }


  /**
   * Generate appropriate filename for export
   */
  private generateFilename(originalName: string, selectedOnly: boolean): string {
    const baseName = originalName.replace(/\.pdf$/i, '');
    const suffix = selectedOnly ? '_selected' : '_edited';
    return `${baseName}${suffix}.pdf`;
  }


  /**
   * Download a single file
   */
  downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Download multiple files as a ZIP
   */
  async downloadAsZip(blobs: Blob[], filenames: string[], zipFilename: string): Promise<void> {
    // For now, download files individually
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
