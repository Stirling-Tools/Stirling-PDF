import type { PipelineOutputMode } from "@portal/api/pipelines";

/**
 * The output destinations the pipeline builder offers. An extension point:
 * deployments where a destination cannot work shadow this module and filter
 * the list (e.g. hosted deployments never write to the server's filesystem,
 * so folder outputs are not offered there).
 */
export function availableOutputModes(): PipelineOutputMode[] {
  return ["inline", "folder", "s3"];
}
