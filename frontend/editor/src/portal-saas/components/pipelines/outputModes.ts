import type { PipelineOutputMode } from "@portal/api/pipelines";

/**
 * Hosted deployments never write to the server's filesystem (the backend's
 * FolderAccessGuard denies it outright), so folder outputs are not offered in
 * the pipeline builder. Inline is not offered either: inline results live in
 * transient job storage with no portal download surface, so for an unattended
 * pipeline they would simply expire unseen.
 */
export function availableOutputModes(): PipelineOutputMode[] {
  return ["s3"];
}
