import { useState, useEffect } from "react";
import { PDFMetadataService } from "../../../services/pdfMetadataService";
import { useSelectedFiles } from "../../../contexts/file/fileHooks";
import { ChangeMetadataParametersHook } from "./useChangeMetadataParameters";

export const useMetadataExtraction = (params: ChangeMetadataParametersHook) => {
  const { selectedFiles } = useSelectedFiles();
  const [isExtractingMetadata, setIsExtractingMetadata] = useState(false);
  const [hasExtractedMetadata, setHasExtractedMetadata] = useState(false);

  // Extract metadata from first file when files change
  useEffect(() => {
    const extractMetadata = async () => {
      if (selectedFiles.length === 0 || hasExtractedMetadata) {
        return;
      }

      const firstFile = selectedFiles[0];
      if (!firstFile) {
        return;
      }

      setIsExtractingMetadata(true);
      try {
        const result = await PDFMetadataService.extractMetadata(firstFile);

        if (result.success) {
          const metadata = result.metadata;

          // Pre-populate all fields with extracted metadata
          params.updateParameter('title', metadata.title);
          params.updateParameter('author', metadata.author);
          params.updateParameter('subject', metadata.subject);
          params.updateParameter('keywords', metadata.keywords);
          params.updateParameter('creator', metadata.creator);
          params.updateParameter('producer', metadata.producer);
          params.updateParameter('creationDate', metadata.creationDate);
          params.updateParameter('modificationDate', metadata.modificationDate);
          params.updateParameter('trapped', metadata.trapped);

          // Set custom metadata entries directly to avoid state update timing issues
          params.updateParameter('customMetadata', metadata.customMetadata);

          setHasExtractedMetadata(true);
        }
      } catch (error) {
        console.warn('Failed to extract metadata:', error);
      } finally {
        setIsExtractingMetadata(false);
      }
    };

    extractMetadata();
  }, [selectedFiles, hasExtractedMetadata, params]);

  return {
    isExtractingMetadata,
    hasExtractedMetadata,
  };
};
