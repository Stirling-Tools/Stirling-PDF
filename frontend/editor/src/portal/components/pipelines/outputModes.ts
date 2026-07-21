import type { PipelineOutputMode } from "@portal/api/pipelines";

/**
 * The source types that can be written to, i.e. offered as a pipeline's output destination. An
 * extension point: deployments where a destination cannot work shadow this module and filter the
 * list (e.g. hosted deployments never write to the server's filesystem, so folder destinations are
 * not offered there and only S3 remains).
 */
export function availableOutputModes(): PipelineOutputMode[] {
  return ["folder", "s3"];
}
