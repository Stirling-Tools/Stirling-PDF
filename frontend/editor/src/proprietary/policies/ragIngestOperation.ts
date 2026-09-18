import type { BidirectionalToolConfig } from "@app/hooks/tools/shared/toolOperationDescriptor";
import type {
  RagIngestApiRequest,
  ToolEndpoint,
} from "@app/types/toolApiTypes";

export const RAG_INGEST_ENDPOINT =
  "/api/v1/docparse/rag-ingest" satisfies ToolEndpoint;
export const RAG_INGEST_DEFAULTS = {
  chunkSize: 512,
  overlap: 64,
  index: true,
  exportMarkdown: false,
  exportChunksJsonl: false,
  includeOriginal: true,
} satisfies RagIngestApiRequest;

type RagParameters = Record<keyof typeof RAG_INGEST_DEFAULTS, string>;

/** Shared by the guided menus and builder; invalid edits stay visible until corrected. */
export function ragChunkingConfigured(
  parameters: Pick<RagIngestApiRequest, "chunkSize" | "overlap">,
): boolean {
  const chunkSize = parameters.chunkSize ?? RAG_INGEST_DEFAULTS.chunkSize;
  const overlap = parameters.overlap ?? RAG_INGEST_DEFAULTS.overlap;
  return (
    Number.isInteger(chunkSize) &&
    chunkSize >= 64 &&
    chunkSize <= 32768 &&
    Number.isInteger(overlap) &&
    overlap >= 0 &&
    overlap <= 4096 &&
    overlap < chunkSize
  );
}

export const ragIngestOperationConfig: BidirectionalToolConfig<
  RagParameters,
  typeof RAG_INGEST_ENDPOINT
> = {
  endpoint: RAG_INGEST_ENDPOINT,
  defaultParameters: {
    chunkSize: String(RAG_INGEST_DEFAULTS.chunkSize),
    overlap: String(RAG_INGEST_DEFAULTS.overlap),
    index: "true",
    exportMarkdown: "false",
    exportChunksJsonl: "false",
    includeOriginal: "true",
  },
  toApiParams: (parameters) => ({
    chunkSize: Number(parameters.chunkSize),
    overlap: Number(parameters.overlap),
    index: parameters.index !== "false",
    exportMarkdown: parameters.exportMarkdown === "true",
    exportChunksJsonl: parameters.exportChunksJsonl === "true",
    includeOriginal: parameters.includeOriginal !== "false",
  }),
  fromApiParams: (parameters) => ({
    chunkSize: String(parameters.chunkSize ?? RAG_INGEST_DEFAULTS.chunkSize),
    overlap: String(parameters.overlap ?? RAG_INGEST_DEFAULTS.overlap),
    index: String(parameters.index ?? true),
    exportMarkdown: String(parameters.exportMarkdown ?? false),
    exportChunksJsonl: String(parameters.exportChunksJsonl ?? false),
    includeOriginal: String(parameters.includeOriginal ?? true),
  }),
};
