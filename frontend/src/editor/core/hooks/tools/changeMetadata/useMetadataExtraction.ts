import { useState, useEffect, useRef } from "react";
import { extractPDFMetadata } from "@editor/services/pdfMetadataService";
import { useViewScopedFiles } from "@editor/hooks/tools/shared/useViewScopedFiles";
import { ChangeMetadataParameters } from "@editor/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { useReadablePdf } from "@editor/hooks/useReadablePdf";

interface MetadataExtractionParams {
  updateParameter: <K extends keyof ChangeMetadataParameters>(
    key: K,
    value: ChangeMetadataParameters[K],
  ) => void;
}

export const useMetadataExtraction = (params: MetadataExtractionParams) => {
  const selectedFiles = useViewScopedFiles();
  const readable = useReadablePdf(selectedFiles[0]);
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
      if (!readable) {
        return;
      }

      if (hasExtractedMetadata) {
        return;
      }

      setIsExtractingMetadata(true);

      const result = await extractPDFMetadata(readable.file, readable.password);

      if (result.success) {
        const metadata = result.metadata;

        // Pre-populate all fields with extracted metadata
        params.updateParameter("title", metadata.title);
        params.updateParameter("author", metadata.author);
        params.updateParameter("subject", metadata.subject);
        params.updateParameter("keywords", metadata.keywords);
        params.updateParameter("creator", metadata.creator);
        params.updateParameter("producer", metadata.producer);
        params.updateParameter(
          "creationDate",
          metadata.creationDate ? new Date(metadata.creationDate) : null,
        );
        params.updateParameter(
          "modificationDate",
          metadata.modificationDate
            ? new Date(metadata.modificationDate)
            : null,
        );
        params.updateParameter("trapped", metadata.trapped);
        params.updateParameter("customMetadata", metadata.customMetadata);

        setHasExtractedMetadata(true);
      } else {
        console.warn("Failed to extract metadata:", result.error);
      }

      setIsExtractingMetadata(false);
    };

    extractMetadata();
  }, [readable, hasExtractedMetadata, params]);

  return {
    isExtractingMetadata,
    hasExtractedMetadata,
  };
};
