import apiClient from "@editor/services/apiClient";
import type {
  FileId,
  StirlingFile,
  StirlingFileStub,
} from "@editor/types/fileContext";
import { uploadTemporaryFileInChunks } from "@editor/services/chunkedUploadService";
import { storedFileIdForStub } from "@editor/services/serverFileReference";

/** Must stay below the server temp-file TTL so a cached reference is never used after eviction. */
const WORKING_SET_TTL_MINUTES = 60;
const CACHE_TTL_MS = (WORKING_SET_TTL_MINUTES - 5) * 60 * 1000;
const CACHE_KEY = "stirling.workingSetReferences";

interface CachedReference {
  reference: string;
  expiresAt: number;
}

const references = new Map<string, CachedReference>();
const inFlight = new Map<string, Promise<string | undefined>>();
let loaded = false;

function storage(): Storage | undefined {
  return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
}

function loadCache(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CachedReference>;
    const now = Date.now();
    for (const [fileId, entry] of Object.entries(parsed)) {
      if (entry.expiresAt > now) {
        references.set(fileId, entry);
      }
    }
  } catch {
    // A corrupt cache is only a performance loss; the next operation uploads again.
  }
}

function persist(): void {
  try {
    const now = Date.now();
    const entries: Record<string, CachedReference> = {};
    for (const [fileId, entry] of references) {
      if (entry.expiresAt > now) entries[fileId] = entry;
    }
    storage()?.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Private-mode quota errors must not fail the operation.
  }
}

/** Returns a working-set reference, uploading once when no server copy exists. */
export async function ensureWorkingSetReference(
  source: StirlingFile,
  uploadFile: File,
  getStub: (id: FileId) => StirlingFileStub | undefined,
): Promise<string | undefined> {
  loadCache();

  const stub = getStub(source.fileId);
  if (stub?.processedFile?.isEncrypted === true) {
    return undefined;
  }

  const serverReference = storedFileIdForStub(stub);
  if (serverReference) return serverReference;

  // Key by content identity, not just the file id: an in-place edit keeps the id but changes
  // the quick key, and must not reuse the previous bytes' temporary copy.
  const cacheKey = `${source.fileId}:${source.quickKey ?? source.lastModified}`;
  const cached = references.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.reference;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const upload = (async () => {
    const chunkedId = await uploadTemporaryFileInChunks(uploadFile);
    let id = chunkedId;
    if (id === undefined) {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const response = await apiClient.post(
        `/api/v1/storage/files/temporary?ttlMinutes=${WORKING_SET_TTL_MINUTES}`,
        formData,
      );
      id = Number((response.data as { id?: unknown } | undefined)?.id);
    }
    if (!Number.isFinite(id)) return undefined;

    const reference = `storage:${id}`;
    references.set(cacheKey, {
      reference,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    persist();
    return reference;
  })();
  inFlight.set(cacheKey, upload);
  try {
    return await upload;
  } finally {
    inFlight.delete(cacheKey);
  }
}

/** Resolves every input or nothing, so one failure falls back to uploads for the whole batch. */
export async function ensureWorkingSetReferences(
  sources: StirlingFile[],
  uploads: File[],
  getStub: (id: FileId) => StirlingFileStub | undefined,
): Promise<Map<FileId, string>> {
  const results = await Promise.allSettled(
    sources.map((source, index) =>
      ensureWorkingSetReference(source, uploads[index] ?? source, getStub),
    ),
  );
  const resolved = new Map<FileId, string>();
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status !== "fulfilled" || !result.value) return new Map();
    resolved.set(sources[index].fileId, result.value);
  }
  return resolved;
}
