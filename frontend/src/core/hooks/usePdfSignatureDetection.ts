import { useState, useEffect } from "react";
import { extractSignatureFieldRects } from "@app/services/pdfiumService";
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
    let isCancelled = false;

    const checkForDigitalSignatures = async () => {
      if (files.length === 0) {
        setHasDigitalSignatures(false);
        setIsChecking(false);
        return;
      }

      setIsChecking(true);
      let foundSignature = false;

      try {
        for (const file of files) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const signatureFields =
              await extractSignatureFieldRects(arrayBuffer);
            if (signatureFields.length > 0) {
              foundSignature = true;
            }
          } catch (error) {
            console.warn("Error analyzing PDF for signatures:", error);
          }

          if (foundSignature) break;
        }
      } catch (error) {
        console.warn("Error checking for digital signatures:", error);
      }

      if (!isCancelled) {
        setHasDigitalSignatures(foundSignature);
        setIsChecking(false);
      }
    };

    checkForDigitalSignatures();

    return () => {
      isCancelled = true;
    };
  }, [files]);

  return {
    hasDigitalSignatures,
    isChecking,
  };
};
