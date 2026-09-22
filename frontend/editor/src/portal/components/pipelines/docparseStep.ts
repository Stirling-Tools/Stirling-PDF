/** The ingest step uses an endpoint step because it has no editor tool-registry entry. */

import type { ErasedToolParams } from "@app/hooks/tools/shared/toolOperationTypes";
import type { WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";

import type { IngestApiRequest } from "@app/types/toolApiTypes";
import {
  INGEST_ENDPOINT,
  INGEST_DEFAULTS,
  ingestChunkingConfigured,
} from "@app/policies/ingestOperation";
export { INGEST_ENDPOINT } from "@app/policies/ingestOperation";

/** Parameters the ingest endpoint binds, as the builder holds them. */
export type IngestStepParams = IngestApiRequest;

export function isIngestStep(step: WorkingToolStep): boolean {
  return step.toolId === null && step.operation === INGEST_ENDPOINT;
}

/** A new ingest step on the endpoint's own defaults, so it runs without being opened. */
export function newIngestStep(): WorkingToolStep {
  return {
    toolId: null,
    operation: INGEST_ENDPOINT,
    params: { ...INGEST_DEFAULTS } as unknown as ErasedToolParams,
    support: "unknown",
  };
}

/**
 * Whether the step can run. The endpoint rejects a request that would neither index nor export,
 * and an overlap at or above the chunk size, so both are caught here rather than at run time.
 */
export function ingestStepConfigured(
  step: WorkingToolStep,
  editorInput = false,
): boolean {
  if (!isIngestStep(step)) return true;
  const params = step.params as IngestStepParams;
  if (
    editorInput &&
    (params.exportChunksJsonl === true ||
      params.exportMarkdown === true ||
      params.includeOriginal === false)
  )
    return false;
  const doesSomething =
    params.index !== false ||
    params.exportMarkdown === true ||
    params.exportChunksJsonl === true;
  const hasFiles =
    params.includeOriginal !== false ||
    params.exportMarkdown === true ||
    params.exportChunksJsonl === true;
  return doesSomething && hasFiles && ingestChunkingConfigured(params);
}
