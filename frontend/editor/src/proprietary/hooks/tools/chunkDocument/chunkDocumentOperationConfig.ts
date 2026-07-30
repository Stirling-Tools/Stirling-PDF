import apiClient from "@app/services/apiClient";
import {
  defineCustomTool,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/toolOperationTypes";
import { deriveName } from "@app/hooks/tools/shared/docparseFilenames";
import {
  ChunkDocumentParameters,
  defaultParameters,
} from "@app/hooks/tools/chunkDocument/useChunkDocumentParameters";

export const CHUNK_DOCUMENT_ENDPOINT = "/api/v1/docparse/chunk-document";

export const buildChunkDocumentFormData = (
  parameters: ChunkDocumentParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("chunkSize", String(parameters.chunkSize));
  formData.append("overlap", String(parameters.overlap));
  formData.append("mode", parameters.mode);
  return formData;
};

/** The chunks array, whether the backend returns it bare or wrapped. */
export function chunksFromResponse(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const wrapped = (data as { chunks?: unknown[] } | null)?.chunks;
  return Array.isArray(wrapped) ? wrapped : [];
}

/** JSON chunks -> one JSONL line per chunk, the standard RAG-ingest shape. */
export function chunksToJsonl(chunks: unknown[]): string {
  return chunks.map((chunk) => JSON.stringify(chunk)).join("\n");
}

const processChunkDocument = async (
  parameters: ChunkDocumentParameters,
  files: File[],
): Promise<CustomProcessorResult> => {
  if (files.length === 0) return { files: [] };

  const [inputFile] = files;
  const response = await apiClient.post<unknown>(
    CHUNK_DOCUMENT_ENDPOINT,
    buildChunkDocumentFormData(parameters, inputFile),
  );

  const resultFile = new File(
    [chunksToJsonl(chunksFromResponse(response.data))],
    deriveName(inputFile.name, ".chunks.jsonl"),
    { type: "application/x-ndjson" },
  );
  return { files: [resultFile] };
};

export const chunkDocumentOperationConfig =
  defineCustomTool<ChunkDocumentParameters>({
    operationType: "chunkDocument",
    endpoint: CHUNK_DOCUMENT_ENDPOINT,
    customProcessor: processChunkDocument,
    defaultParameters,
  });
