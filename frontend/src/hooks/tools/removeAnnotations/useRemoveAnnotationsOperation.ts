import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemoveAnnotationsParameters, defaultParameters } from './useRemoveAnnotationsParameters';

// Client-side PDF processing using PDF-lib
const removeAnnotationsProcessor = async (_parameters: RemoveAnnotationsParameters, files: File[]): Promise<File[]> => {
  // Dynamic import of PDF-lib for client-side processing
  const { PDFDocument, PDFName, PDFRef, PDFDict } = await import('pdf-lib');

  const processedFiles: File[] = [];

  for (const file of files) {
    try {
      // Load the PDF
      const fileArrayBuffer = await file.arrayBuffer();
      const pdfBytesIn = new Uint8Array(fileArrayBuffer);
      const pdfDoc = await PDFDocument.load(pdfBytesIn, { ignoreEncryption: true });
      const ctx = pdfDoc.context;

      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        // Annots() returns PDFArray | undefined
        const annots = page.node.Annots();
        if (!annots || annots.size() === 0) continue;

        // Delete each annotation object (they are usually PDFRef)
        for (let j = annots.size() - 1; j >= 0; j--) {
          try {
            const entry = annots.get(j);
            if (entry instanceof PDFRef) {
              ctx.delete(entry);
            } else if (entry instanceof PDFDict) {
              // In practice, Annots array should contain refs; if not, just remove the array linkage.
              // (We avoid poking internal maps to find a ref for the dict.)
            }
          } catch (err) {
            console.warn(`Failed to remove annotation ${j} on page ${i + 1}:`, err);
          }
        }

        // Remove the Annots key entirely
        try {
          if (page.node.has(PDFName.of('Annots'))) {
            page.node.delete(PDFName.of('Annots'));
          }
        } catch (err) {
          console.warn(`Failed to delete /Annots on page ${i + 1}:`, err);
        }
      }

      // Optional: if removing ALL annotations across the doc, strip AcroForm to avoid dangling widget refs
      try {
        const catalog = pdfDoc.catalog; // typed PDFCatalog wrapper
        const dict = catalog.dict;      // underlying PDFDict
        if (dict.has(PDFName.of('AcroForm'))) {
          dict.delete(PDFName.of('AcroForm'));
        }
      } catch (err) {
        console.warn('Failed to remove /AcroForm:', err);
      }

      // Save returns Uint8Array — safe for Blob
      const outBytes = await pdfDoc.save();
      const outBlob = new Blob([outBytes], { type: 'application/pdf' });

      // Create new file with modified name
      const fileName = file.name.replace(/\.pdf$/i, '') + '_removed_annotations.pdf';
      const processedFile = new File([outBlob], fileName, { type: 'application/pdf' });

      processedFiles.push(processedFile);
    } catch (error) {
      console.error('Error processing file:', file.name, error);
      throw new Error(`Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return processedFiles;
};

// Static configuration object
export const removeAnnotationsOperationConfig = {
  toolType: ToolType.custom,
  operationType: 'removeAnnotations',
  customProcessor: removeAnnotationsProcessor,
  defaultParameters,
} as const;

export const useRemoveAnnotationsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemoveAnnotationsParameters>({
    ...removeAnnotationsOperationConfig,
    getErrorMessage: createStandardErrorHandler(t('removeAnnotations.error.failed', 'An error occurred while removing annotations from the PDF.'))
  });
};