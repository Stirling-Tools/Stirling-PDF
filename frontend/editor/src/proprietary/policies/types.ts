/**
 * Wire types for the Stirling policy API (`/api/v1/policies`), the decoded
 * frontend shape, and the display types used to render stats and activity.
 *
 * The backend stores all portal-level metadata (categoryId, sources, scope,
 * reviewer, fieldValues, runOn, output settings) inside `output.options` — the
 * same "options bag" the editor uses. `trigger` is always null for
 * portal/editor-authored policies; the editor fires runs on upload/export via
 * `/run`, so there is no server-side trigger.
 */

// ── Wire types (match Policy.java / PipelineStep.java / PolicyRunView.java) ──

export interface WirePipelineStep {
  operation: string;
  parameters: Record<string, unknown>;
  fileParameters?: Record<string, string>;
}

export interface WireOutputOptions {
  runOn: "upload" | "export";
  mode: "new_file" | "new_version";
  name: string;
  position: "prefix" | "suffix" | "auto-number";
  maxRetries?: number;
  retryDelayMinutes?: number;
  categoryId: string;
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
}

export interface WireOutputSpec {
  type: "inline";
  options: Partial<WireOutputOptions>;
}

/**
 * Mirrors `EditorConfig.java`. Absent only on records that never went through the
 * backend (hand-built fixtures); a stored policy always carries it, derived from
 * the legacy `output.options` bag when it predates the field.
 */
export interface WireEditorConfig {
  allowed: boolean;
  runOn: "upload" | "export";
}

export interface WirePolicy {
  id: string;
  name: string;
  owner?: string;
  enabled: boolean;
  trigger: null;
  steps: WirePipelineStep[];
  output: WireOutputSpec;
  editor?: WireEditorConfig;
  teamId?: string;
}

// ── Run view (mirrors PolicyRunView.java) ─────────────────────────────────────

export type PolicyRunStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_FOR_INPUT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface PolicyRunView {
  runId: string;
  policyId: string | null;
  status: PolicyRunStatus;
  currentStep: number;
  stepCount: number;
  error: string | null;
  errorCode?: string | null;
  errorSubscribed?: boolean | null;
  outputs: { fileId: string; fileName: string }[];
  /** Creation timestamp in epoch milliseconds. */
  createdAt: number;
}

// ── Frontend decoded shape ────────────────────────────────────────────────────

/** Policy settings unpacked from the wire record's `output.options` bag. */
export interface PolicyDecodedState {
  id: string;
  name: string;
  enabled: boolean;
  categoryId: string;
  sources: string[];
  /**
   * Whether the editor runs this policy per file. Its own field, not derived from
   * `sources`: the seeded Classification policy is editor-run with empty sources,
   * so re-deriving on write would silently take it off the editor.
   */
  runsOnEditor: boolean;
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
  runOn: "upload" | "export";
  outputMode: "new_file" | "new_version";
  outputName: string;
  outputNamePosition: "prefix" | "suffix" | "auto-number";
  maxRetries: number;
  retryDelayMinutes: number;
  steps: WirePipelineStep[];
}

// ── Display types (returned by runs.ts derivations) ───────────────────────────

export interface PolicyStats {
  /** Completed enforcement runs. */
  enforced: number;
  /** Human-formatted total data processed (e.g. "2.3 GB"), or "—" when unknown. */
  dataProcessed: string;
  /** Human-formatted duration since first run (e.g. "34d"), or "—". */
  activeFor: string;
}

export interface PolicyActivityItem {
  doc: string;
  action: string;
  /** Relative timestamp, e.g. "2h ago". */
  time: string;
  status: "enforced" | "flagged" | "processing";
}
