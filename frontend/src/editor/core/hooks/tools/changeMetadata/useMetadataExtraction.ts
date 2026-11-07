import { useState, useEffect, useRef } from "react";
import { extractPDFMetadata } from "@editor/services/pdfMetadataService";
import { useViewScopedFiles } from "@editor/hooks/tools/shared/useViewScopedFiles";
import {
  ChangeMetadataParameters,
  defaultParameters,
} from "@editor/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { useReadablePdf } from "@editor/hooks/useReadablePdf";
import { ExtractedPDFMetadata } from "@editor/types/metadata";

interface MetadataExtractionParams {
  updateParameter: <K extends keyof ChangeMetadataParameters>(
    key: K,
    value: ChangeMetadataParameters[K],
  ) => void;
}

interface Prefill {
  fileId: string;
  decrypted: boolean;
}

function applyMetadata(
  updateParameter: MetadataExtractionParams["updateParameter"],
  metadata: ExtractedPDFMetadata,
) {
  updateParameter("title", metadata.title);
  updateParameter("author", metadata.author);
  updateParameter("subject", metadata.subject);
  updateParameter("keywords", metadata.keywords);
  updateParameter("creator", metadata.creator);
  updateParameter("producer", metadata.producer);
  updateParameter(
    "creationDate",
    metadata.creationDate ? new Date(metadata.creationDate) : null,
  );
  updateParameter(
    "modificationDate",
    metadata.modificationDate ? new Date(metadata.modificationDate) : null,
  );
  updateParameter("trapped", metadata.trapped);
  updateParameter("customMetadata", metadata.customMetadata);
}

function clearMetadata(
  updateParameter: MetadataExtractionParams["updateParameter"],
) {
  updateParameter("title", defaultParameters.title);
  updateParameter("author", defaultParameters.author);
  updateParameter("subject", defaultParameters.subject);
  updateParameter("keywords", defaultParameters.keywords);
  updateParameter("creator", defaultParameters.creator);
  updateParameter("producer", defaultParameters.producer);
  updateParameter("creationDate", defaultParameters.creationDate);
  updateParameter("modificationDate", defaultParameters.modificationDate);
  updateParameter("trapped", defaultParameters.trapped);
  updateParameter("customMetadata", defaultParameters.customMetadata);
}

export const useMetadataExtraction = (params: MetadataExtractionParams) => {
  const selectedFiles = useViewScopedFiles();
  const source = selectedFiles[0];
  const readable = useReadablePdf(source);
  const [isExtractingMetadata, setIsExtractingMetadata] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const updateParameter = useRef(params.updateParameter);
  const decrypted =
    readable !== null &&
    (readable.file !== source || readable.password !== undefined);
  const target =
    readable && source && (!decrypted || selectedFiles.length === 1)
      ? source.fileId
      : null;

  useEffect(() => {
    updateParameter.current = params.updateParameter;
  });

  useEffect(() => {
    if (!prefill || prefill.fileId === target) return;
    if (prefill.decrypted) clearMetadata(updateParameter.current);
    setPrefill(null);
  }, [prefill, target]);

  useEffect(() => {
    if (!readable || !target || prefill) return;
    let cancelled = false;
    setIsExtractingMetadata(true);
    void extractPDFMetadata(readable.file, readable.password).then((result) => {
      if (cancelled) return;
      if (result.success) {
        applyMetadata(updateParameter.current, result.metadata);
        setPrefill({ fileId: target, decrypted });
      } else {
        console.warn("Failed to extract metadata:", result.error);
      }
      setIsExtractingMetadata(false);
    });
    return () => {
      cancelled = true;
      setIsExtractingMetadata(false);
    };
  }, [readable, target, prefill, decrypted]);

  return {
    isExtractingMetadata,
    hasExtractedMetadata: prefill !== null,
  };
};
