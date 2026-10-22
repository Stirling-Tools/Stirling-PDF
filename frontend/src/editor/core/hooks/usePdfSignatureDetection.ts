import { useState, useEffect } from "react";
import {
  extractSignatureFieldRects,
  extractSignatures,
} from "@app/services/pdfiumService";
import { StirlingFile } from "@app/types/fileContext";

export interface PdfSignatureDetectionResult {
  hasDigitalSignatures: boolean;
  isChecking: boolean;
}

export const usePdfSignatureDetection = (
  files: StirlingFile[],
): PdfSignatureDetectionResult => {
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

      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const [signatures, fields] = await Promise.all([
            extractSignatures(arrayBuffer),
            extractSignatureFieldRects(arrayBuffer),
          ]);
          if (signatures.length > 0 || fields.length > 0) {
            foundSignature = true;
            break;
          }
        } catch (error) {
          console.warn("Error analyzing PDF for signatures:", error);
        }
      }

      setHasDigitalSignatures(foundSignature);
      setIsChecking(false);
    };

    checkForDigitalSignatures();
  }, [files]);

  return {
    hasDigitalSignatures,
    isChecking,
  };
};
