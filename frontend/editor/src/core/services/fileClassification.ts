/**
 * Read a file's document-classification category from the PDF metadata the
 * classify policy writes (the `StirlingPDFClassification` Info-dict key). Loading
 * PDF bytes is expensive, so callers read once and cache the result on the file's
 * stub (`classificationCategory`); the Files sidebar then groups by category
 * without re-reading. Returns null for non-PDF / oversized / unclassified files.
 */

import { fileStorage } from "@app/services/fileStorage";
import { extractPDFMetadata } from "@app/services/pdfMetadataService";
import type { FileId } from "@app/types/file";
import type {
  StirlingFileStub,
  StubFileClassification,
} from "@app/types/fileContext";

export const CLASSIFICATION_METADATA_KEY = "StirlingPDFClassification";

/** Cap the auto-read by size — never pull a multi-GB file into memory for a tag. */
const MAX_READ_BYTES = 25 * 1024 * 1024;

export type StubClassificationCategory = StubFileClassification;

/**
 * Parse the stored classification JSON (the engine response the classify policy
 * writes verbatim, minus `outcome`) into the cached stub shape, or null when
 * off-list. Keys are the engine's camelCase: category/categoryLabel, docType/
 * docTypeLabel, tags.
 */
function parseCategoryEntry(value: string): StubClassificationCategory | null {
  const raw = JSON.parse(value) as Record<string, unknown>;
  const id = typeof raw.category === "string" ? raw.category : "";
  // No category, or the off-list sentinel → treat as uncategorized.
  if (!id || id === "unknown") return null;
  const label =
    typeof raw.categoryLabel === "string" && raw.categoryLabel
      ? raw.categoryLabel
      : id;
  const docType =
    typeof raw.docType === "string" && raw.docType && raw.docType !== "unknown"
      ? raw.docType
      : undefined;
  const docTypeLabel =
    docType && typeof raw.docTypeLabel === "string" && raw.docTypeLabel
      ? raw.docTypeLabel
      : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  return {
    id,
    label,
    ...(docType ? { docType } : {}),
    ...(docTypeLabel ? { docTypeLabel } : {}),
    ...(tags && tags.length ? { tags } : {}),
  };
}

/**
 * Read the category from a File's PDF metadata directly. Used at classify-import
 * time, when we already hold the tagged output blob, so the category is stamped
 * onto the stub deterministically rather than via a later best-effort read.
 */
export async function readClassificationCategoryFromFile(
  file: File,
): Promise<StubClassificationCategory | null> {
  try {
    const result = await extractPDFMetadata(file);
    if (!result.success) return null;
    const entry = result.metadata.customMetadata.find(
      (item) => item.key === CLASSIFICATION_METADATA_KEY,
    );
    return entry ? parseCategoryEntry(entry.value) : null;
  } catch {
    return null;
  }
}

/**
 * Read the category (id + human label) from a stub's file, or null when absent,
 * unreadable, off-list (`unknown`), non-PDF, or over the size cap.
 */
export async function readStubClassificationCategory(
  stub: StirlingFileStub,
): Promise<StubClassificationCategory | null> {
  if (stub.type && !stub.type.toLowerCase().includes("pdf")) return null;
  if (stub.size > MAX_READ_BYTES) return null;
  const file = await fileStorage
    .getStirlingFile(stub.id as FileId)
    .catch(() => null);
  if (!file) return null;
  return readClassificationCategoryFromFile(file);
}
