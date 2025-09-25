import { useTranslation } from 'react-i18next';
import { useToolOperation, ToolType } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';
import { RemoveAnnotationsParameters, defaultParameters } from './useRemoveAnnotationsParameters';

// Client-side PDF processing using PDF-lib
const removeAnnotationsProcessor = async (_parameters: RemoveAnnotationsParameters, files: File[]): Promise<File[]> => {
  // Dynamic import of PDF-lib for client-side processing
  const { PDFDocument } = await import('pdf-lib');

  const processedFiles: File[] = [];

  for (const file of files) {
    try {
      // Load the PDF
      const fileArrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileArrayBuffer, { ignoreEncryption: true });

      // Get all pages and remove annotations
      const pages = pdfDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const annots = page.node.Annots();
        if (!annots || annots.size() === 0) continue;

        const ctx = annots.context;

        // delete each annotation object (reverse to be safe)
        for (let j = annots.size() - 1; j >= 0; j--) {
          try {
            const annot = annots.get(j);
            if (annot) ctx.delete(annot);
          } catch (err) {
            console.warn(`Failed to remove annotation ${j} on page ${i + 1}:`, err);
          }
        }

        // remove the Annots entry entirely
        try {
          if (page.node.has('Annots')) page.node.delete('Annots');
        } catch (err) {
          console.warn(`Failed to delete Annots key on page ${i + 1}:`, err);
        }
      }

      // If removing ALL annotations across the doc, also strip AcroForm:
      try {
        const catalog = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Root);
        if (catalog?.has && catalog.has('AcroForm')) catalog.delete('AcroForm');
      } catch (err) {
        console.warn('Failed to remove AcroForm:', err);
      }

      // Save the processed PDF
      const pdfBytes = await pdfDoc.save();
      const processedBlob = new Blob([pdfBytes.buffer], { type: 'application/pdf' });

      // Create new file with modified name
      const fileName = file.name.replace(/\.pdf$/i, '') + '_removed_annotations.pdf';
      const processedFile = new File([processedBlob], fileName, { type: 'application/pdf' });

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