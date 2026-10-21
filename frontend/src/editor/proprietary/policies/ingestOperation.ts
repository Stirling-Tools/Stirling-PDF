import type { BidirectionalToolConfig } from "@app/hooks/tools/shared/toolOperationDescriptor";
import type { IngestApiRequest, ToolEndpoint } from "@app/types/toolApiTypes";

export const INGEST_ENDPOINT = "/api/v1/docparse/ingest" satisfies ToolEndpoint;
export const INGEST_DEFAULTS = {
  chunkSize: 512,
  overlap: 64,
  index: true,
  exportMarkdown: false,
  exportChunksJsonl: false,
  includeOriginal: true,
} satisfies IngestApiRequest;

type IngestParameters = Record<keyof typeof INGEST_DEFAULTS, string>;

/** Shared by the guided menus and builder; invalid edits stay visible until corrected. */
export function ingestChunkingConfigured(
  parameters: Pick<IngestApiRequest, "chunkSize" | "overlap">,
): boolean {
  const chunkSize = parameters.chunkSize ?? INGEST_DEFAULTS.chunkSize;
  const overlap = parameters.overlap ?? INGEST_DEFAULTS.overlap;
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

export const ingestOperationConfig: BidirectionalToolConfig<
  IngestParameters,
  typeof INGEST_ENDPOINT
> = {
  endpoint: INGEST_ENDPOINT,
  defaultParameters: {
    chunkSize: String(INGEST_DEFAULTS.chunkSize),
    overlap: String(INGEST_DEFAULTS.overlap),
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
    chunkSize: String(parameters.chunkSize ?? INGEST_DEFAULTS.chunkSize),
    overlap: String(parameters.overlap ?? INGEST_DEFAULTS.overlap),
    index: String(parameters.index ?? true),
    exportMarkdown: String(parameters.exportMarkdown ?? false),
    exportChunksJsonl: String(parameters.exportChunksJsonl ?? false),
    includeOriginal: String(parameters.includeOriginal ?? true),
  }),
};
