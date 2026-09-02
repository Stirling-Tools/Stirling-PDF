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
import type { AutomationOperation } from "@app/types/automation";

/** Lifecycle status of a policy category for the current user/org. */
export type PolicyStatus = "default" | "active" | "paused";

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
  /**
   * Requires the AI engine to be enabled. Hidden from the catalog when the
   * engine is off, so the policy only appears where it can actually run.
   */
  requiresAiEngine?: boolean;
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

/** Per-category runtime state held in the local cache. */
export interface PolicyState {
  configured: boolean;
  status: PolicyStatus;
  /** Selected sources (ids from POLICY_SOURCES). */
  sources: string[];
  /** The policy's own name. Set for builder pipelines, which have no built-in category label. */
  name?: string;
  /** Whether the policy runs in the editor as each file passes through (resolved at decode). */
  runsOnEditor?: boolean;
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
  /** Whether the rename rule is applied before ("prefix") or after ("suffix")
   *  the base filename, or as an auto-incrementing number. */
  outputNamePosition?: "prefix" | "suffix" | "auto-number";
  /** When the policy runs: on "upload" or before "export". See `defaultRunOn`. */
  runOn?: "upload" | "export";
  /**
   * Execution order among policies that share a trigger. When several policies run
   * on the same event they fire in ascending `order`, each on the previous one's
   * output (a cumulative chain). Defaults to the policy's position in the catalog
   * until an admin reorders them, which persists an explicit value for every policy.
   */
  order?: number;
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
