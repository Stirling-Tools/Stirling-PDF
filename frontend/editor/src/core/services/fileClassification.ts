/**
 * Read a file's classification labels from the PDF metadata the classify policy
 * writes (the `StirlingPDFClassification` Info-dict key). Loading PDF bytes is
 * expensive, so callers read once and cache the result on the file's stub
 * (`classificationLabels`); the Files sidebar then groups by label without
 * re-reading. Returns null for non-PDF / oversized / unclassified files.
 */

import { fileStorage } from "@app/services/fileStorage";
import { extractPDFMetadata } from "@app/services/pdfMetadataService";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

export const CLASSIFICATION_METADATA_KEY = "StirlingPDFClassification";

/** Cap the auto-read by size — never pull a multi-GB file into memory for a label. */
const MAX_READ_BYTES = 25 * 1024 * 1024;

/**
 * Parse the stored classification JSON (the engine response the classify policy
 * writes verbatim, minus `outcome`: `{"labels": ["Contract", "NDA"]}`) into the
 * cached stub shape, or null when absent/empty.
 */
function parseLabelsEntry(value: string): string[] | null {
  const raw = JSON.parse(value) as Record<string, unknown>;
  const labels = Array.isArray(raw.labels)
    ? raw.labels.filter(
        (label): label is string =>
          typeof label === "string" && label.trim().length > 0,
      )
    : [];
  return labels.length > 0 ? labels : null;
}

/**
 * Read the labels from a File's PDF metadata directly. Used at classify-import
 * time, when we already hold the labelled output blob, so the labels are stamped
 * onto the stub deterministically rather than via a later best-effort read.
 */
export async function readClassificationLabelsFromFile(
  file: File,
): Promise<string[] | null> {
  try {
    const result = await extractPDFMetadata(file);
    if (!result.success) return null;
    const entry = result.metadata.customMetadata.find(
      (item) => item.key === CLASSIFICATION_METADATA_KEY,
    );
    return entry ? parseLabelsEntry(entry.value) : null;
  } catch {
    return null;
  }
}

/**
 * Read the labels from a stub's file, or null when absent, unreadable, empty,
 * non-PDF, or over the size cap.
 */
export async function readStubClassificationLabels(
  stub: StirlingFileStub,
): Promise<string[] | null> {
  if (stub.type && !stub.type.toLowerCase().includes("pdf")) return null;
  if (stub.size > MAX_READ_BYTES) return null;
  const file = await fileStorage
    .getStirlingFile(stub.id as FileId)
    .catch(() => null);
  if (!file) return null;
  return readClassificationLabelsFromFile(file);
}
