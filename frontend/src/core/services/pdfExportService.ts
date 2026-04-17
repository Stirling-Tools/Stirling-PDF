import {
  getPdfiumModule,
  openRawDocumentSafe,
  closeRawDocument,
  saveRawDocument,
  importPages,
  setPageRotation,
  addNewPage,
} from "@app/services/pdfiumService";
import { downloadFile } from "@app/services/downloadService";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";

// A4 dimensions in PDF points (72 dpi)
const A4_WIDTH = 595.276;
const A4_HEIGHT = 841.89;

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
    options: ExportOptions = {},
  ): Promise<{ blob: Blob; filename: string }> {
    const { selectedOnly = false, filename } = options;

    try {
      const pagesToExport =
        selectedOnly && selectedPageIds.length > 0
          ? pdfDocument.pages.filter((page) =>
              selectedPageIds.includes(page.id),
            )
          : pdfDocument.pages;

      if (pagesToExport.length === 0) {
        throw new Error("No pages to export");
      }

      const originalPDFBytes = await pdfDocument.file.arrayBuffer();
      const blob = await this.createSingleDocument(
        originalPDFBytes,
        pagesToExport,
      );
      const exportFilename = this.generateFilename(
        filename || pdfDocument.name,
      );

      return { blob, filename: exportFilename };
    } catch (error) {
      console.error("PDF export error:", error);
      throw new Error(
        `Failed to export PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
        { cause: error },
      );
    }
  }

  /**
   * Export PDF document with applied operations (multi-file source)
   */
  async exportPDFMultiFile(
    pdfDocument: PDFDocument,
    sourceFiles: Map<string, File>,
    selectedPageIds: string[] = [],
    options: ExportOptions = {},
  ): Promise<{ blob: Blob; filename: string }> {
    const { selectedOnly = false, filename } = options;

    try {
      const pagesToExport =
        selectedOnly && selectedPageIds.length > 0
          ? pdfDocument.pages.filter((page) =>
              selectedPageIds.includes(page.id),
            )
          : pdfDocument.pages;

      if (pagesToExport.length === 0) {
        throw new Error("No pages to export");
      }

      const blob = await this.createMultiSourceDocument(
        sourceFiles,
        pagesToExport,
      );
      const exportFilename = this.generateFilename(
        filename || pdfDocument.name,
      );

      return { blob, filename: exportFilename };
    } catch (error) {
      console.error("Multi-file PDF export error:", error);
      throw new Error(
        `Failed to export PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
        { cause: error },
      );
    }
  }

  /**
   * Create a PDF document from multiple source files using PDFium WASM.
   */
  private async createMultiSourceDocument(
    sourceFiles: Map<string, File>,
    pages: PDFPage[],
  ): Promise<Blob> {
    const m = await getPdfiumModule();

    // Create destination document
    const destDocPtr = m.FPDF_CreateNewDocument();
    if (!destDocPtr)
      throw new Error("PDFium: failed to create destination document");

    // Load all source documents once and cache them
    const loadedDocs = new Map<string, number>();

    try {
      for (const [fileId, file] of sourceFiles) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const docPtr = await openRawDocumentSafe(arrayBuffer);
          loadedDocs.set(fileId, docPtr);
        } catch (error) {
          console.warn(`Failed to load source file ${fileId}:`, error);
        }
      }

      let insertIdx = 0;
      for (const page of pages) {
        if (page.isBlankPage || page.originalPageNumber === -1) {
          // Insert a blank A4 page
          await addNewPage(destDocPtr, insertIdx, A4_WIDTH, A4_HEIGHT);
          // Apply rotation
          const pdfiumRotation = degreesToPdfiumRotation(page.rotation);
          if (pdfiumRotation !== 0) {
            await setPageRotation(destDocPtr, insertIdx, pdfiumRotation);
          }
          insertIdx++;
        } else if (page.originalFileId && loadedDocs.has(page.originalFileId)) {
          const srcDocPtr = loadedDocs.get(page.originalFileId)!;
          const srcPageCount = m.FPDF_GetPageCount(srcDocPtr);
          const sourcePageIndex = page.originalPageNumber - 1;

          if (sourcePageIndex >= 0 && sourcePageIndex < srcPageCount) {
            // Import the specific page (1-based page range for FPDF_ImportPages)
            const pageRange = String(sourcePageIndex + 1);
            const imported = await importPages(
              destDocPtr,
              srcDocPtr,
              pageRange,
              insertIdx,
            );
            if (!imported) {
              console.warn(
                `[PDFExport] importPages failed for fileId=${page.originalFileId} pageRange=${pageRange} — page will be missing from output.`,
              );
            }

            // Apply rotation
            const pdfiumRotation = degreesToPdfiumRotation(page.rotation);
            if (pdfiumRotation !== 0) {
              await setPageRotation(destDocPtr, insertIdx, pdfiumRotation);
            }
            insertIdx++;
          }
        } else {
          console.warn(
            `Cannot find source document for page ${page.pageNumber} (fileId: ${page.originalFileId})`,
          );
        }
      }

      // Save the assembled document
      const resultBuf = await saveRawDocument(destDocPtr);
      return new Blob([resultBuf], { type: "application/pdf" });
    } finally {
      // Cleanup all loaded source documents
      for (const docPtr of loadedDocs.values()) {
        await closeRawDocument(docPtr);
      }
      m.FPDF_CloseDocument(destDocPtr);
    }
  }

  /**
   * Create a single PDF document with all operations applied (single source) using PDFium.
   */
  private async createSingleDocument(
    sourceData: ArrayBuffer,
    pages: PDFPage[],
  ): Promise<Blob> {
    const m = await getPdfiumModule();

    // Open source document
    const srcDocPtr = await openRawDocumentSafe(sourceData);
    const destDocPtr = m.FPDF_CreateNewDocument();
    if (!destDocPtr) {
      await closeRawDocument(srcDocPtr);
      throw new Error("PDFium: failed to create destination document");
    }

    try {
      const srcPageCount = m.FPDF_GetPageCount(srcDocPtr);
      let insertIdx = 0;

      for (const page of pages) {
        if (page.isBlankPage || page.originalPageNumber === -1) {
          await addNewPage(destDocPtr, insertIdx, A4_WIDTH, A4_HEIGHT);
          const pdfiumRotation = degreesToPdfiumRotation(page.rotation);
          if (pdfiumRotation !== 0) {
            await setPageRotation(destDocPtr, insertIdx, pdfiumRotation);
          }
          insertIdx++;
        } else {
          const sourcePageIndex = page.originalPageNumber - 1;

          if (sourcePageIndex >= 0 && sourcePageIndex < srcPageCount) {
            const pageRange = String(sourcePageIndex + 1);
            const imported = await importPages(
              destDocPtr,
              srcDocPtr,
              pageRange,
              insertIdx,
            );
            if (!imported) {
              console.warn(
                `[PDFExport] importPages failed for page ${page.originalPageNumber} pageRange=${pageRange} — page will be missing from output.`,
              );
            }

            const pdfiumRotation = degreesToPdfiumRotation(page.rotation);
            if (pdfiumRotation !== 0) {
              await setPageRotation(destDocPtr, insertIdx, pdfiumRotation);
            }
            insertIdx++;
          }
        }
      }

      const resultBuf = await saveRawDocument(destDocPtr);
      return new Blob([resultBuf], { type: "application/pdf" });
    } finally {
      await closeRawDocument(srcDocPtr);
      m.FPDF_CloseDocument(destDocPtr);
    }
  }

  /**
   * Generate appropriate filename for export
   */
  private generateFilename(originalName: string): string {
    const baseName = originalName.replace(/\.pdf$/i, "");
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
      }, index * 500);
    });
  }

  /**
   * Validate PDF operations before export
   */
  validateExport(
    pdfDocument: PDFDocument,
    selectedPageIds: string[],
    selectedOnly: boolean,
  ): string[] {
    const errors: string[] = [];

    if (selectedOnly && selectedPageIds.length === 0) {
      errors.push("No pages selected for export");
    }

    if (pdfDocument.pages.length === 0) {
      errors.push("No pages available to export");
    }

    const pagesToExport = selectedOnly
      ? pdfDocument.pages.filter((page) => selectedPageIds.includes(page.id))
      : pdfDocument.pages;

    if (pagesToExport.length === 0) {
      errors.push("No valid pages to export after applying filters");
    }

    return errors;
  }

  /**
   * Get export preview information
   */
  getExportInfo(
    pdfDocument: PDFDocument,
    selectedPageIds: string[],
    selectedOnly: boolean,
  ): {
    pageCount: number;
    splitCount: number;
    estimatedSize: string;
  } {
    const pagesToExport = selectedOnly
      ? pdfDocument.pages.filter((page) => selectedPageIds.includes(page.id))
      : pdfDocument.pages;

    const splitCount = pagesToExport.reduce((count, page) => {
      return count + (page.splitAfter ? 1 : 0);
    }, 1);

    const avgPageSize = pdfDocument.file.size / pdfDocument.totalPages;
    const estimatedBytes = avgPageSize * pagesToExport.length;
    const estimatedSize = this.formatFileSize(estimatedBytes);

    return {
      pageCount: pagesToExport.length,
      splitCount,
      estimatedSize,
    };
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

/**
 * Convert degrees (0, 90, 180, 270) to PDFium rotation enum (0, 1, 2, 3).
 */
function degreesToPdfiumRotation(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  switch (normalized) {
    case 90:
      return 1;
    case 180:
      return 2;
    case 270:
      return 3;
    default:
      return 0;
  }
}

// Export singleton instance
export const pdfExportService = new PDFExportService();
