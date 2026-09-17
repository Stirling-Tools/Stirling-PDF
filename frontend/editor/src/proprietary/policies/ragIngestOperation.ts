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
  mode: "auto",
  index: true,
  exportMarkdown: false,
  exportChunksJsonl: false,
  includeOriginal: true,
} satisfies RagIngestApiRequest;

type RagParameters = {
  [Key in keyof typeof RAG_INGEST_DEFAULTS]: Key extends "mode"
    ? NonNullable<RagIngestApiRequest["mode"]>
    : string;
};

/** Shared by the guided menus and builder; invalid edits stay visible until corrected. */
export function ragChunkingConfigured(
  parameters: Pick<RagIngestApiRequest, "chunkSize" | "overlap"> & {
    mode?: string;
  },
): boolean {
  const chunkSize = parameters.chunkSize ?? RAG_INGEST_DEFAULTS.chunkSize;
  const overlap = parameters.overlap ?? RAG_INGEST_DEFAULTS.overlap;
  const mode = parameters.mode ?? RAG_INGEST_DEFAULTS.mode;
  return (
    Number.isInteger(chunkSize) &&
    chunkSize >= 64 &&
    chunkSize <= 32768 &&
    Number.isInteger(overlap) &&
    overlap >= 0 &&
    overlap <= 4096 &&
    overlap < chunkSize &&
    ["auto", "basic"].includes(mode)
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
    mode: RAG_INGEST_DEFAULTS.mode,
    index: "true",
    exportMarkdown: "false",
    exportChunksJsonl: "false",
    includeOriginal: "true",
  },
  toApiParams: (parameters) => ({
    chunkSize: Number(parameters.chunkSize),
    overlap: Number(parameters.overlap),
    mode: parameters.mode,
    index: parameters.index !== "false",
    exportMarkdown: parameters.exportMarkdown === "true",
    exportChunksJsonl: parameters.exportChunksJsonl === "true",
    includeOriginal: parameters.includeOriginal !== "false",
  }),
  fromApiParams: (parameters) => ({
    chunkSize: String(parameters.chunkSize ?? RAG_INGEST_DEFAULTS.chunkSize),
    overlap: String(parameters.overlap ?? RAG_INGEST_DEFAULTS.overlap),
    mode: parameters.mode ?? RAG_INGEST_DEFAULTS.mode,
    index: String(parameters.index ?? true),
    exportMarkdown: String(parameters.exportMarkdown ?? false),
    exportChunksJsonl: String(parameters.exportChunksJsonl ?? false),
    includeOriginal: String(parameters.includeOriginal ?? true),
  }),
};
