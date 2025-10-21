import { PDFDocument } from '@app/types/pageEditor';
import { pdfExportService } from '@app/services/pdfExportService';
import { FileId } from '@app/types/file';

/**
 * Export processed documents to File objects
 * Handles both single documents and split documents (multiple PDFs)
 */
export async function exportProcessedDocumentsToFiles(
  processedDocuments: PDFDocument | PDFDocument[],
  sourceFiles: Map<FileId, File> | null,
  exportFilename: string
): Promise<File[]> {
  console.log('exportProcessedDocumentsToFiles called with:', {
    isArray: Array.isArray(processedDocuments),
    numDocs: Array.isArray(processedDocuments) ? processedDocuments.length : 1,
    hasSourceFiles: sourceFiles !== null,
    sourceFilesSize: sourceFiles?.size
  });

  if (Array.isArray(processedDocuments)) {
    // Multiple documents (splits)
    const files: File[] = [];
    const baseName = exportFilename.replace(/\.pdf$/i, '');

    for (let i = 0; i < processedDocuments.length; i++) {
      const doc = processedDocuments[i];
      const partFilename = `${baseName}_part_${i + 1}.pdf`;

      const result = sourceFiles
        ? await pdfExportService.exportPDFMultiFile(doc, sourceFiles, [], { selectedOnly: false, filename: partFilename })
        : await pdfExportService.exportPDF(doc, [], { selectedOnly: false, filename: partFilename });

      files.push(new File([result.blob], result.filename, { type: 'application/pdf' }));
    }

    return files;
  } else {
    // Single document
    const result = sourceFiles
      ? await pdfExportService.exportPDFMultiFile(processedDocuments, sourceFiles, [], { selectedOnly: false, filename: exportFilename })
      : await pdfExportService.exportPDF(processedDocuments, [], { selectedOnly: false, filename: exportFilename });

    return [new File([result.blob], result.filename, { type: 'application/pdf' })];
  }
}
