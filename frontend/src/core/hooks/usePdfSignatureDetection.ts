import { useState, useEffect } from 'react';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { StirlingFile } from '@app/types/fileContext';

export interface PdfSignatureDetectionResult {
  hasDigitalSignatures: boolean;
  isChecking: boolean;
}

export const usePdfSignatureDetection = (files: StirlingFile[]): PdfSignatureDetectionResult => {
  const [hasDigitalSignatures, setHasDigitalSignatures] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const checkForDigitalSignatures = async () => {
      if (files.length === 0) {
        setHasDigitalSignatures(false);
        return;
      }

      setIsChecking(true);
      let foundSignature = false;

      try {

        for (const file of files) {
          const arrayBuffer = await file.arrayBuffer();

          try {
            const pdf = await pdfWorkerManager.createDocument(arrayBuffer);

            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const annotations = await page.getAnnotations({ intent: 'display' });

              annotations.forEach((annotation: any) => {
                if (annotation.subtype === 'Widget' && annotation.fieldType === 'Sig') {
                  foundSignature = true;
                }
              });

              if (foundSignature) break;
            }

            // Clean up PDF document using worker manager
            pdfWorkerManager.destroyDocument(pdf);
          } catch (error) {
            console.warn('Error analyzing PDF for signatures:', error);
          }

          if (foundSignature) break;
        }
      } catch (error) {
        console.warn('Error checking for digital signatures:', error);
      }

      setHasDigitalSignatures(foundSignature);
      setIsChecking(false);
    };

    checkForDigitalSignatures();
  }, [files]);

  return {
    hasDigitalSignatures,
    isChecking
  };
};
