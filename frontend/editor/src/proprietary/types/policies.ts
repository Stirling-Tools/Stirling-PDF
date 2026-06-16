/**
 * Types for Policies — a proprietary, automation-backed enforcement feature.
 *
 * A Policy is conceptually like a Watch Folder (a configured automation that
 * runs over documents) but backend-driven and triggered by *sources/events*
 * (editor save/export, device sweeps, cloud connectors) rather than just a
 * folder. Per-policy state is persisted locally (localStorage). Activity + stats
 * shown in the detail view are derived live from the user's real uploaded files.
 */

import type { ReactNode } from "react";
import type {
  AutomationConfig,
  AutomationOperation,
} from "@app/types/automation";

/** Lifecycle status of a policy category for the current user/org. */
export type PolicyStatus = "default" | "active" | "paused";

/** Derived display status for a row/detail (treats a spend-limit hit as paused). */
export type PolicyRowStatus = "active" | "paused" | "setup";

/** A configurable field within a policy's settings. */
export type PolicyFieldType = "toggle" | "select" | "chips" | "text";

export interface PolicyField {
  label: string;
  key: string;
  type: PolicyFieldType;
  /** Current value: boolean (toggle), string (select/text), string[] (chips). */
  value: boolean | string | string[];
  /** Options for select/chips. */
  options?: string[];
}

/** Static definition of a policy category (the "what it does"). */
export interface PolicyCategory {
  id: string;
  label: string;
  icon: ReactNode;
  /** Long description shown in the setup wizard. */
  desc: string;
  /**
   * This category provides document classification, so it's the target of the
   * setup wizard's "Set up Classification" action. Data-driven replacement for
   * the hardcoded `selectPolicy("ingestion")` call site.
   */
  providesClassification?: boolean;
  /**
   * Not yet available — shown as a locked "Coming soon" row that can't be opened
   * or configured. Only Security is live today.
   */
  comingSoon?: boolean;
}

/**
 * The three-up summary stats shown at the foot of a configured policy's detail,
 * derived live from the user's uploaded files (see policyLiveData).
 */
export interface PolicyStats {
  /** Documents enforced (rendered with toLocaleString). */
  enforced: number;
  /** Human-formatted data-processed figure, e.g. "2.3 GB". */
  dataProcessed: string;
  /** Human-formatted active-for figure, e.g. "12d", or "—" when idle. */
  activeFor: string;
}

/** The narrative + field configuration backing a category. */
export interface PolicyConfigDef {
  /** One-line summary of what the policy enforces. */
  summary: string;
  /** Pipeline-like rule chips shown in the "Enforces" section. */
  rules: string[];
  /** Human label for the scope this policy applies to. */
  scopeLabel: string;
  /** Editable settings fields. */
  fields: PolicyField[];
  /**
   * The preset pipeline this category seeds a new policy with — the real,
   * editable tool steps (same shape as the backend's `PipelineStep` and the
   * Watch Folders automation `operations`). Configuring a policy starts from
   * these and the user can edit them.
   */
  defaultOperations: AutomationOperation[];
}

/** A document a source can ingest, used in the wizard's "Sources" step. */
export interface PolicySource {
  id: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

/** An entry in a policy's recent-activity feed (derived from real uploads). */
export interface PolicyActivityItem {
  /** Document the policy acted on. */
  doc: string;
  /** What the policy did, e.g. "Classified as Contract • 3 tables extracted". */
  action: string;
  /** Relative timestamp, e.g. "2h ago". */
  time: string;
  /**
   * "enforced" (clean green), "flagged" (needs review, amber), or "processing"
   * (in progress — enforcement currently running, blue).
   */
  status: "enforced" | "flagged" | "processing";
  /** The backend run this row reflects — used to offer Retry on a failed run. */
  runId?: string;
  /** The file the run acted on — needed to re-run it on Retry. */
  fileId?: string;
}

/** Per-category runtime state held in the local cache. */
export interface PolicyState {
  configured: boolean;
  status: PolicyStatus;
  /** Selected sources (ids from POLICY_SOURCES). */
  sources: string[];
  /** When non-empty, narrows the policy to these document types. */
  scopeTypes: string[];
  /** Email that low-confidence enforcements are routed to. */
  reviewerEmail: string;
  /** Saved field values, keyed by field key (overrides the definition default). */
  fieldValues: Record<string, boolean | string | string[]>;
  /** How a run's output is delivered: a separate new file, or a new version of
   *  the input file the policy ran on. Defaults to "new_version". */
  outputMode?: "new_file" | "new_version";
  /** Rename rule for the output. When empty (the default) the output keeps the
   *  input's filename; when set, it's applied as a prefix/suffix per the policy's
   *  name-position setting. */
  outputName?: string;
  /** When the policy runs: on "upload" or before "export". Defaults to "upload". */
  runOn?: "upload" | "export";
  /**
   * The backing folder-trigger record (a Watched Folders `WatchedFolder`) that
   * holds this policy's editable steps (its automation), output config and run
   * state. Present once the policy is configured. The folder trigger reuses the
   * Watched Folders engine; this is the link to it. Maps to the backend's
   * `Policy.trigger` (folder) + `steps` + `output`.
   */
  folderId?: string;
  /**
   * Id of this policy's record on the backend (the source of truth). Present once
   * it has been persisted server-side; used to update/delete/run it.
   */
  backendId?: string;
  /**
   * A built-in policy (one of the shipped catalog categories) rather than a
   * user-created one. Default policies are configurable but NOT deletable — the
   * Delete action is hidden for them (it returns for custom policies later).
   */
  isDefault?: boolean;
}

export type PoliciesByCategory = Record<string, PolicyState>;

/**
 * Output + retry settings applied by the Watch Folders engine to a policy's
 * backing folder (the real, working settings reused from the folder setup).
 */
export interface PolicyFolderSettings {
  /** The editor event the policy runs on: "upload" or "export". */
  runOn: "upload" | "export";
  outputMode: "new_file" | "new_version";
  outputName: string;
  outputNamePosition: "prefix" | "suffix" | "auto-number";
  maxRetries: number;
  retryDelayMinutes: number;
}

/** Everything the shared policy wizard collects, handed back on submit. */
export interface PolicyWizardResult {
  /** The saved workflow automation (created on setup, updated in place on edit). */
  automation: AutomationConfig;
  fieldValues: Record<string, boolean | string | string[]>;
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
  /** Output + retry settings for the backing folder. */
  folder: PolicyFolderSettings;
  /**
   * Backend pipeline steps (each `operation` is a tool ENDPOINT path), built
   * from the workflow via the tool registry in the wizard's Workflow step — the
   * hook persists these to the backend without needing the registry itself.
   * Structurally matches policyPipeline's `BackendPipelineStep` (inlined here to
   * avoid a types↔services import cycle).
   */
  pipelineSteps: {
    operation: string;
    parameters: Record<string, unknown>;
    fileParameters?: Record<string, string>;
  }[];
  /** Operation ids whose endpoint couldn't be resolved (dropped from steps). */
  unresolvedOps: string[];
}

/**
 * What the locked tool-config page hands back on save. Unlike the wizard's
 * result it carries the tool `operations` directly (the page owns a fixed,
 * configure-only chain — there's no separate saved automation), plus the
 * endpoint-mapped pipeline steps. Used for both first-time configure and edits
 * of a preset policy.
 */
export interface PolicyConfigResult {
  /** The enabled tools (in order) as automation operations. */
  operations: AutomationOperation[];
  /** Endpoint-mapped backend steps built from `operations` via the registry. */
  pipelineSteps: PolicyWizardResult["pipelineSteps"];
  /** Operation ids whose endpoint couldn't be resolved (dropped from steps). */
  unresolvedOps: string[];
  fieldValues: Record<string, boolean | string | string[]>;
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
  folder: PolicyFolderSettings;
}

/** Which sub-view of a configured policy's detail panel is showing. */
export type PolicyDetailView = "detail" | "settings";
