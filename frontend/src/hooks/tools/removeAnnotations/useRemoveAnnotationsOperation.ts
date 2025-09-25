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

      for (let i = 0; i < pages.length; ++i) {
        const page = pages[i];
        const annotations = page.node.Annots();
        if (!annotations) continue;

        const ctx = annotations.context;

        // Remove annotations in reverse order to avoid index shifting issues
        for (let j = annotations.size() - 1; j >= 0; j--) {
          try {
            const annotation = annotations.get(j);
            if (annotation) {
              ctx.delete(annotation);
            }
          } catch (error) {
            console.warn(`Failed to remove annotation ${j} on page ${i + 1}:`, error);
          }
        }

        // Clear the annotations array reference from the page
        try {
          page.node.set('Annots', ctx.obj([]));
        } catch (error) {
          console.warn(`Failed to clear annotations array on page ${i + 1}:`, error);
        }
      }

      // Save the processed PDF
      const pdfBytes = await pdfDoc.save();
      const processedBlob = new Blob([pdfBytes], { type: 'application/pdf' });

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