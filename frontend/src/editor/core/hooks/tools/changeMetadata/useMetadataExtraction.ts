import { useState, useEffect, useRef } from "react";
import { extractPDFMetadata } from "@editor/services/pdfMetadataService";
import { useViewScopedFiles } from "@editor/hooks/tools/shared/useViewScopedFiles";
import type { FileId } from "@editor/types/fileContext";
import { ChangeMetadataParameters } from "@editor/hooks/tools/changeMetadata/useChangeMetadataParameters";

interface MetadataExtractionParams {
  updateParameter: <K extends keyof ChangeMetadataParameters>(
    key: K,
    value: ChangeMetadataParameters[K],
  ) => void;
}

export const useMetadataExtraction = (params: MetadataExtractionParams) => {
  const selectedFiles = useViewScopedFiles();
  const [isExtractingMetadata, setIsExtractingMetadata] = useState(false);
  const [hasExtractedMetadata, setHasExtractedMetadata] = useState(false);
  const previousFileCountRef = useRef(0);
  // The file whose read has started, set when it starts rather than when it
  // lands: the effect below re-runs on every render while the read is in
  // flight, and each extra read that lands late rewrites the parameters, which
  // clears a finished run's results. Keyed by file so a failed read still lets
  // the next file pre-fill the fields.
  const extractionStartedForRef = useRef<FileId | null>(null);

  // Reset extraction state only when files are cleared (length goes to 0)
  useEffect(() => {
    if (previousFileCountRef.current > 0 && selectedFiles.length === 0) {
      setHasExtractedMetadata(false);
      extractionStartedForRef.current = null;
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

      if (
        hasExtractedMetadata ||
        extractionStartedForRef.current === firstFile.fileId
      ) {
        return;
      }

      extractionStartedForRef.current = firstFile.fileId;
      setIsExtractingMetadata(true);

      const result = await extractPDFMetadata(firstFile);

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
  }, [selectedFiles, hasExtractedMetadata, params]);

  return {
    isExtractingMetadata,
    hasExtractedMetadata,
  };
};
