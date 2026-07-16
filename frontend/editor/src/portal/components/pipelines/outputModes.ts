import type { PipelineOutputMode } from "@portal/api/pipelines";

/**
 * The output destination types a saved Output can be. An extension point:
 * deployments where a destination cannot work shadow this module and filter the
 * list (e.g. hosted deployments never write to the server's filesystem, so folder
 * destinations are not offered there and only S3 remains).
 */
export function availableOutputModes(): PipelineOutputMode[] {
  return ["folder", "s3"];
}
