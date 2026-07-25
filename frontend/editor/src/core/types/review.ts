/**
 * Types for the document review area. A reviewed file carries a processing
 * trail — every tool, policy, and pipeline run that touched it.
 */

import { ToolId } from "@app/types/toolId";

export type ReviewRunSource = "tool" | "policy" | "pipeline";

export type ReviewStepStatus = "completed" | "failed" | "skipped";

/** One step inside a run — a single tool execution or policy/pipeline stage. */
export interface ReviewTrailStep {
  id: string;
  /** Registry tool id when the step maps to an editor tool (used for naming). */
  toolId?: ToolId;
  /** Display label when the step is not a plain tool run (e.g. "Classify document"). */
  label?: string;
  status: ReviewStepStatus;
  /** Extra context — tag applied, error message for failed steps, etc. */
  detail?: string;
}

/**
 * One run in the trail. Tools have exactly one step; policies and pipelines
 * can have several.
 */
export interface ReviewTrailRun {
  id: string;
  source: ReviewRunSource;
  /** Run name — tool name, policy name, or pipeline name. */
  name: string;
  timestamp: number;
  steps: ReviewTrailStep[];
  /** Tags this run applied to the document (e.g. classification labels). */
  tags?: string[];
}
