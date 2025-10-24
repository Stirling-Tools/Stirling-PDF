import { useState, useEffect, useRef } from "react";
import { extractPDFMetadata } from "@app/services/pdfMetadataService";
import { useSelectedFiles } from "@app/contexts/file/fileHooks";
import { ChangeMetadataParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

interface MetadataExtractionParams {
  updateParameter: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
}

export const useMetadataExtraction = (params: MetadataExtractionParams) => {
  const { selectedFiles } = useSelectedFiles();
  const [isExtractingMetadata, setIsExtractingMetadata] = useState(false);
  const [hasExtractedMetadata, setHasExtractedMetadata] = useState(false);
  const previousFileCountRef = useRef(0);

  // Reset extraction state only when files are cleared (length goes to 0)
  useEffect(() => {
    if (previousFileCountRef.current > 0 && selectedFiles.length === 0) {
      setHasExtractedMetadata(false);
    }
    previousFileCountRef.current = selectedFiles.length;
  }, [selectedFiles]);

  // Extract metadata from first file when files change
  useEffect(() => {
    const extractMetadata = async () => {
      if (selectedFiles.length === 0) {
        return;
      }
      const firstFile = selectedFiles[0];

      if (hasExtractedMetadata) {
        return;
      }

      setIsExtractingMetadata(true);

      const result = await extractPDFMetadata(firstFile);

      if (result.success) {
        const metadata = result.metadata;

        // Pre-populate all fields with extracted metadata
        params.updateParameter('title', metadata.title);
        params.updateParameter('author', metadata.author);
        params.updateParameter('subject', metadata.subject);
        params.updateParameter('keywords', metadata.keywords);
        params.updateParameter('creator', metadata.creator);
        params.updateParameter('producer', metadata.producer);
        params.updateParameter('creationDate', metadata.creationDate ? new Date(metadata.creationDate) : null);
        params.updateParameter('modificationDate', metadata.modificationDate ? new Date(metadata.modificationDate) : null);
        params.updateParameter('trapped', metadata.trapped);
        params.updateParameter('customMetadata', metadata.customMetadata);

        setHasExtractedMetadata(true);
      } else {
        console.warn('Failed to extract metadata:', result.error);
      }

      setIsExtractingMetadata(false);
    };

    extractMetadata();
  }, [selectedFiles, hasExtractedMetadata, params]);

  return {
    isExtractingMetadata,
    hasExtractedMetadata,
  };
};
