/**
 * Read a file's classification labels from the PDF metadata the classify policy
 * writes (the `StirlingPDFClassification` Info-dict key). Loading PDF bytes is
 * expensive, so callers read once and cache the result on the file's stub
 * (`classificationLabels`); the Files sidebar then groups by label without
 * re-reading. Returns null for non-PDF / oversized / unclassified files.
 */

import { fileStorage } from "@app/services/fileStorage";
import { extractPDFMetadata } from "@app/services/pdfMetadataService";
import { readBlobSlice } from "@app/utils/blobSlice";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

export const CLASSIFICATION_METADATA_KEY = "StirlingPDFClassification";

/** Cap the auto-read by size — never pull a multi-GB file into memory for a label. */
const MAX_READ_BYTES = 25 * 1024 * 1024;
const CLASSIFICATION_PROBE_BYTES = 64 * 1024;

function containsClassificationMarker(bytes: Uint8Array): boolean {
  // "StirlingPDFClassification" ASCII bytes
  const needle = [
    0x53, 0x74, 0x69, 0x72, 0x6c, 0x69, 0x6e, 0x67, 0x50, 0x44, 0x46, 0x43,
    0x6c, 0x61, 0x73, 0x73, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6f,
    0x6e,
  ];
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function quickProbeClassificationMarker(file: File): Promise<boolean> {
  const tailStart = Math.max(0, file.size - CLASSIFICATION_PROBE_BYTES);
  const tailBytes = await readBlobSlice(file, tailStart);
  if (containsClassificationMarker(tailBytes)) return true;
  if (tailStart === 0) return false;
  const headBytes = await readBlobSlice(file, 0, CLASSIFICATION_PROBE_BYTES);
  return containsClassificationMarker(headBytes);
}

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
    if (!(await quickProbeClassificationMarker(file))) {
      return null;
    }
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

const stubClassificationPromises = new WeakMap<
  StirlingFileStub,
  Promise<string[] | null>
>();

/**
 * Read the labels from a stub's file, or null when absent, unreadable, empty,
 * non-PDF, or over the size cap.
 */
export async function readStubClassificationLabels(
  stub: StirlingFileStub,
): Promise<string[] | null> {
  if (stub.type && !stub.type.toLowerCase().includes("pdf")) return null;
  if (stub.size > MAX_READ_BYTES) return null;
  if (stub.classificationLabels !== undefined) {
    return stub.classificationLabels;
  }
  const inFlight = stubClassificationPromises.get(stub);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const file = await fileStorage
      .getStirlingFile(stub.id as FileId)
      .catch(() => null);
    if (!file) return null;
    return readClassificationLabelsFromFile(file);
  })();

  stubClassificationPromises.set(stub, promise);
  return promise;
}
