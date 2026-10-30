import apiClient from "@editor/services/apiClient";

const MAX_CHUNK_SIZE = 4 * 1024 * 1024;
const MIN_CHUNK_SIZE = 256 * 1024;
const CHUNK_GRANULARITY = 256 * 1024;
const MAX_CHUNKS = 4096;
const CONCURRENCY = 6;
const WAVES_PER_WORKER = 4;
const MIN_CHUNKED_SIZE = 1024 * 1024;
const MAX_CHUNK_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

/** Balances request count against a long tail when the file has fewer chunks than workers. */
export function chunkSizeFor(sizeBytes: number): number {
  const toBalanceWorkers = Math.ceil(
    sizeBytes / (CONCURRENCY * WAVES_PER_WORKER),
  );
  const toStayUnderMaxChunks = Math.ceil(sizeBytes / MAX_CHUNKS);
  const target = Math.max(
    MIN_CHUNK_SIZE,
    toBalanceWorkers,
    toStayUnderMaxChunks,
  );
  const rounded = Math.ceil(target / CHUNK_GRANULARITY) * CHUNK_GRANULARITY;
  return Math.min(MAX_CHUNK_SIZE, rounded);
}

function retryable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } }).response?.status;
  // A rejected chunk (size/content type) will fail identically on retry.
  return status === undefined || status >= 500;
}

async function putChunk(
  uploadId: string,
  index: number,
  body: Blob,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await apiClient.put(
        `/api/v1/storage/uploads/${uploadId}/chunks/${index}`,
        body,
        { headers: { "Content-Type": "application/octet-stream" } },
      );
      return;
    } catch (error) {
      if (attempt >= MAX_CHUNK_ATTEMPTS || !retryable(error)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)),
      );
    }
  }
}

interface CreateChunkedUploadResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

/** Uploads in parallel and returns the temporary stored-file id, or undefined on failure. */
export async function uploadTemporaryFileInChunks(
  file: File,
): Promise<number | undefined> {
  if (file.size < MIN_CHUNKED_SIZE) return undefined;

  let uploadId: string | undefined;
  try {
    const created = await apiClient.post<CreateChunkedUploadResponse>(
      "/api/v1/storage/uploads",
      {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        chunkSize: chunkSizeFor(file.size),
      },
    );
    const sessionId = created.data.uploadId;
    uploadId = sessionId;
    const { chunkSize, totalChunks } = created.data;

    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= totalChunks) return;
        const start = index * chunkSize;
        await putChunk(
          sessionId,
          index,
          file.slice(start, Math.min(start + chunkSize, file.size)),
        );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, worker),
    );

    const completed = await apiClient.post<{ id: number }>(
      `/api/v1/storage/uploads/${sessionId}/complete`,
    );
    const id = Number(completed.data?.id);
    return Number.isFinite(id) ? id : undefined;
  } catch {
    if (uploadId) {
      try {
        await apiClient.delete(`/api/v1/storage/uploads/${uploadId}`);
      } catch {
        // The server expires abandoned sessions on its own.
      }
    }
    return undefined;
  }
}
