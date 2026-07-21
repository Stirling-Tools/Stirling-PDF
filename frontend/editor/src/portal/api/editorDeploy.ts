import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * This surface manages the org's deployment of the Stirling PDF *Editor*
 * product from the portal — where it runs (Managed Cloud / Docker /
 * Kubernetes), how self-hosted instances pair back to the org, the health of
 * each running instance, and the service credential / offline-activation
 * lifecycle.
 */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Deployment targets                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

/** Where an Editor deployment can run. */
export type TargetKind = "cloud" | "docker" | "kubernetes";

/**
 * Whether a target is usable on the current tier and, if so, whether the org
 * has actually stood it up. `locked` targets render an upgrade nudge instead of
 * a runnable snippet.
 */
export type TargetState = "running" | "available" | "locked";

export interface DeploymentTarget {
  kind: TargetKind;
  label: string;
  /** One-line positioning shown under the title. */
  tagline: string;
  state: TargetState;
  /** Minimum tier that unlocks this target — drives the upgrade nudge copy. */
  requiresTier: Tier;
  /** Install / run snippet for the target's CodeBlock. */
  snippet: string;
  /** Language hint for the CodeBlock chrome. */
  snippetLang: "bash" | "plain";
  /** Populated only when `state === "running"`. */
  runningVersion?: string;
  /** Count of instances currently reporting in for this target. */
  instanceCount?: number;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Pairing                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

/** How a self-hosted editor connects itself to the org. */
export type PairingMethod = "token" | "shortcode" | "iac";

export interface PairingOption {
  method: PairingMethod;
  label: string;
  description: string;
  /** Minimum tier that unlocks this method. */
  requiresTier: Tier;
  /**
   * The current secret/handle to display. A long-lived pairing token, a
   * TV-style short code, or an IaC reference (e.g. a Terraform module input).
   * Pre-masked for token display — never carries the real secret.
   */
  value: string;
  /** Short codes expire fast; tokens rotate on demand. Relative-time string. */
  expires?: string;
  /** Whether this option is currently usable on the active tier. */
  locked: boolean;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Running instances (deployment health)                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export type InstanceStatus = "healthy" | "degraded" | "offline" | "pairing";

export interface EditorInstance {
  id: string;
  /** Human host label, e.g. "edge-fra-01" or "Managed Cloud (us-east-1)". */
  host: string;
  target: TargetKind;
  version: string;
  region: string;
  status: InstanceStatus;
  /** Relative-time string, e.g. "12s ago". */
  lastSeen: string;
  activeUsers: number;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Summary metric strip                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

export interface DeploymentSummaryMetric {
  label: string;
  value: string | number;
  delta?: number;
  deltaDirection?: "up" | "down" | "flat";
  description?: string;
}

export interface DeploymentSummary {
  metrics: DeploymentSummaryMetric[];
  /** Masked service token + its rotation age, shown by the rotation card. */
  serviceToken: { masked: string; lastRotated: string };
  /** Air-gapped activation is enterprise-only; gate the card on this flag. */
  offlineActivationAvailable: boolean;
  /** Where users launch the Editor — the org workspace URL (Open in browser). */
  workspaceUrl: string;
}

export interface EditorDeploymentResponse {
  summary: DeploymentSummary;
  targets: DeploymentTarget[];
  pairings: PairingOption[];
  instances: EditorInstance[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Presentation metadata (lives client-side — product copy, not data)       */
/* ──────────────────────────────────────────────────────────────────────── */

export interface TargetMeta {
  tone: "neutral" | "blue" | "purple";
}

export const TARGET_META: Record<TargetKind, TargetMeta> = {
  cloud: { tone: "blue" },
  docker: { tone: "neutral" },
  kubernetes: { tone: "purple" },
};

export const INSTANCE_STATUS_TONE: Record<
  InstanceStatus,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  healthy: "success",
  degraded: "warning",
  offline: "danger",
  pairing: "info",
};

/** Values are i18n keys — render with t(). */
export const INSTANCE_STATUS_LABEL: Record<InstanceStatus, string> = {
  healthy: "portal.editorAdmin.status.healthy",
  degraded: "portal.editorAdmin.status.degraded",
  offline: "portal.editorAdmin.status.offline",
  pairing: "portal.editorAdmin.status.pairing",
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * GET /v1/editor/deployment?tier=… — the org's Editor deployment: summary
 * metric strip, deployment targets (with run snippets), pairing options, and
 * the live instance health table for the tier.
 */
export async function fetchEditorDeployment(
  tier: Tier,
): Promise<EditorDeploymentResponse> {
  return apiClient.local.json<EditorDeploymentResponse>(
    `/v1/editor/deployment?tier=${encodeURIComponent(tier)}`,
  );
}
