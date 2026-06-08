/**
 * Types for Policies — a proprietary, automation-backed enforcement feature.
 *
 * A Policy is conceptually like a Watch Folder (a configured automation that
 * runs over documents) but backend-driven and triggered by *sources/events*
 * (editor save/export, device sweeps, cloud connectors) rather than just a
 * folder. This frontend is mock/stub-backed; server persistence and real
 * enforcement land in a follow-up.
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
   * Seeded as configured + active on first load — the mock's "ships on" policy.
   * Replaces the former hardcoded `id === "ingestion"` check in the store.
   */
  defaultActive?: boolean;
  /**
   * This category provides document classification, so it's the target of the
   * setup wizard's "Set up Classification" action. Data-driven replacement for
   * the hardcoded `selectPolicy("ingestion")` call site.
   */
  providesClassification?: boolean;
}

/** The three-up summary stats shown at the foot of a configured policy's detail. */
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
  /** Three-up summary stats for the detail view. */
  stats: PolicyStats;
  /** Recent enforcement log shown in the detail view (mock). */
  activity: PolicyActivityItem[];
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

/** An entry in a policy's recent-activity feed (mock enforcement log). */
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
}

/** Per-category runtime state persisted in the mock store. */
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
  /**
   * The backing folder-trigger record (a Watch Folders `SmartFolder`) that holds
   * this policy's editable steps (its automation), output config and run state.
   * Present once the policy is configured. The folder trigger reuses the Watch
   * Folders engine; this is the link to it. Maps to the backend's
   * `Policy.trigger` (folder) + `steps` + `output`.
   */
  folderId?: string;
  /** Mock telemetry surfaced in the detail view. */
  docsEnforced24h: number;
  alerts24h: number;
  lastEnforced: string | null;
}

export type PoliciesByCategory = Record<string, PolicyState>;

/** Mock current-user / org context used for the permission model. */
export type UserRole = "owner" | "admin" | "member";
export interface PolicyUser {
  name: string;
  email: string;
  initials: string;
  role: UserRole;
  /** false = solo user (always full access). */
  hasOrg: boolean;
  /** Explicit grant for members; ignored for owner/admin. */
  policyPermission: boolean;
}

export type BillingTier = "free" | "payg" | "enterprise";
export interface PolicyBilling {
  used: number;
  monthlyQuota: number;
  tier: BillingTier;
}

export interface SpendLimit {
  enabled: boolean;
  limit: number;
  used: number;
  period: "monthly" | "weekly" | "daily";
}

/** The three steps of the unconfigured-policy setup wizard. */
export type PolicySetupStep = 1 | 2 | 3;

/** Everything the shared policy wizard collects, handed back on submit. */
export interface PolicyWizardResult {
  /** The saved workflow automation (created on setup, updated in place on edit). */
  automation: AutomationConfig;
  fieldValues: Record<string, boolean | string | string[]>;
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
}

/** Which sub-view of a configured policy's detail panel is showing. */
export type PolicyDetailView = "detail" | "settings";
