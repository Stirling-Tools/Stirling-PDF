/**
 * Editor deployment fixtures and the types api/editorDeploy.ts shares with them.
 *
 * This surface manages the org's deployment of the Stirling PDF *Editor* product
 * from the portal — where it runs (Managed Cloud / Docker / Kubernetes), how
 * self-hosted instances pair back to the org, the health of each running
 * instance, and the service credential / offline-activation lifecycle.
 *
 * api/editorDeploy.ts imports the types; the MSW handlers serve this fixture
 * data over the intercepted httpJson() calls. Components never reach into this
 * module directly. Once a real backend exists the handlers stop being registered
 * and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";

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
  icon: string;
  tone: "neutral" | "blue" | "purple";
}

export const TARGET_META: Record<TargetKind, TargetMeta> = {
  cloud: { icon: "☁", tone: "blue" },
  docker: { icon: "▣", tone: "neutral" },
  kubernetes: { icon: "⎈", tone: "purple" },
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

export const INSTANCE_STATUS_LABEL: Record<InstanceStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  offline: "Offline",
  pairing: "Pairing",
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Snippet builders                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

const DOCKER_SNIPPET = `docker run -d --name stirling-editor \\
  -p 8080:8080 \\
  -e STIRLING_ORG_PAIRING_TOKEN="$PAIRING_TOKEN" \\
  -e STIRLING_REGION="us-east-1" \\
  -v stirling-data:/var/lib/stirling \\
  stirlingpdf/editor:3.2.1`;

const HELM_SNIPPET = `helm repo add stirling https://charts.stirlingpdf.com
helm install editor stirling/editor \\
  --namespace stirling --create-namespace \\
  --set org.pairingToken="$PAIRING_TOKEN" \\
  --set image.tag=3.2.1 \\
  --set replicaCount=3`;

const CLOUD_SNIPPET = `# Managed Cloud is provisioned for you — no install step.
# Point your users at the org workspace URL:
https://app.stirlingpdf.com/o/acme/editor`;

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tier-aware fixture assembly                                              */
/* ──────────────────────────────────────────────────────────────────────── */

function targetsFor(tier: Tier): DeploymentTarget[] {
  const cloud: DeploymentTarget = {
    kind: "cloud",
    label: "Managed Cloud",
    tagline: "Stirling-hosted, zero-ops. Available on every plan.",
    state: "running",
    requiresTier: "free",
    snippet: CLOUD_SNIPPET,
    snippetLang: "plain",
    runningVersion: "3.2.1",
    instanceCount: 1,
  };

  const dockerUnlocked = tier === "pro" || tier === "enterprise";
  const docker: DeploymentTarget = {
    kind: "docker",
    label: "Docker",
    tagline: "Single-container self-host for a VM or on-prem box.",
    state: dockerUnlocked ? "running" : "locked",
    requiresTier: "pro",
    snippet: DOCKER_SNIPPET,
    snippetLang: "bash",
    ...(dockerUnlocked ? { runningVersion: "3.2.1", instanceCount: 2 } : {}),
  };

  const k8sUnlocked = tier === "pro" || tier === "enterprise";
  const k8s: DeploymentTarget = {
    kind: "kubernetes",
    label: "Kubernetes",
    tagline: "Helm chart with autoscaling for production fleets.",
    // Pro can run K8s but this org has only stood up Docker so far — shows the
    // "available, not yet deployed" state distinct from a tier lock.
    state: k8sUnlocked
      ? tier === "enterprise"
        ? "running"
        : "available"
      : "locked",
    requiresTier: "pro",
    snippet: HELM_SNIPPET,
    snippetLang: "bash",
    ...(tier === "enterprise"
      ? { runningVersion: "3.2.1", instanceCount: 3 }
      : {}),
  };

  return [cloud, docker, k8s];
}

function pairingsFor(tier: Tier): PairingOption[] {
  const iacUnlocked = tier === "enterprise";
  return [
    {
      method: "token",
      label: "Pairing token",
      description:
        "Long-lived secret injected as STIRLING_ORG_PAIRING_TOKEN. Rotate if it leaks.",
      requiresTier: "free",
      value: "pair_live_••••••••••••••3f9a",
      expires: "Rotates manually",
      locked: false,
    },
    {
      method: "shortcode",
      label: "Short code",
      description:
        "TV-style code for pairing a fresh instance from its first-run screen.",
      requiresTier: "free",
      value: "WXYZ-7Q4K",
      expires: "Expires in 9m",
      locked: false,
    },
    {
      method: "iac",
      label: "IaC provisioning",
      description:
        "Terraform / Pulumi module input so instances pair on apply — no manual token handling.",
      requiresTier: "enterprise",
      value: iacUnlocked
        ? 'module "stirling_editor" { org_id = "acme" }'
        : "Enterprise only",
      locked: !iacUnlocked,
    },
  ];
}

function instancesFor(tier: Tier): EditorInstance[] {
  const managed: EditorInstance = {
    id: "inst-cloud-1",
    host: "Managed Cloud",
    target: "cloud",
    version: "3.2.1",
    region: "us-east-1",
    status: "healthy",
    lastSeen: "8s ago",
    activeUsers: 41,
  };

  if (tier === "free") return [managed];

  const pro: EditorInstance[] = [
    managed,
    {
      id: "inst-docker-1",
      host: "edge-iad-01",
      target: "docker",
      version: "3.2.1",
      region: "us-east-1",
      status: "healthy",
      lastSeen: "21s ago",
      activeUsers: 12,
    },
    {
      // Edge case: an instance running a stale version and reporting degraded
      // health — exercises the warning tone and a version-drift signal.
      id: "inst-docker-2",
      host: "edge-fra-01",
      target: "docker",
      version: "3.1.4",
      region: "eu-central-1",
      status: "degraded",
      lastSeen: "3m ago",
      activeUsers: 7,
    },
  ];

  if (tier === "pro") return pro;

  // enterprise — adds a K8s fleet plus an offline air-gapped node and one that
  // dropped off the network.
  return [
    ...pro,
    {
      id: "inst-k8s-1",
      host: "prod-eks/editor-7c9",
      target: "kubernetes",
      version: "3.2.1",
      region: "us-west-2",
      status: "healthy",
      lastSeen: "5s ago",
      activeUsers: 88,
    },
    {
      id: "inst-k8s-2",
      host: "prod-eks/editor-7c9",
      target: "kubernetes",
      version: "3.2.1",
      region: "ap-southeast-1",
      status: "healthy",
      lastSeen: "11s ago",
      activeUsers: 54,
    },
    {
      id: "inst-airgap-1",
      host: "scif-node-a (air-gapped)",
      target: "docker",
      version: "3.2.0",
      region: "on-prem",
      status: "offline",
      lastSeen: "Offline activation · 2d",
      activeUsers: 0,
    },
  ];
}

function summaryFor(
  tier: Tier,
  instances: EditorInstance[],
): DeploymentSummary {
  const live = instances.filter((i) => i.status !== "offline");
  const activeUsers = instances.reduce((s, i) => s + i.activeUsers, 0);
  const versions = new Set(live.map((i) => i.version));

  return {
    metrics: [
      {
        label: "Running instances",
        value: live.length,
        description: `${instances.length} total`,
      },
      {
        label: "Active users",
        value: activeUsers,
        delta: tier === "enterprise" ? 0.18 : 0.07,
        deltaDirection: "up",
      },
      {
        label: "Version spread",
        value: versions.size === 1 ? "Aligned" : `${versions.size} versions`,
        deltaDirection: versions.size === 1 ? "flat" : "down",
        description: versions.size === 1 ? "All on 3.2.1" : "Drift detected",
      },
      {
        label: "Latest release",
        value: "3.2.1",
        description: "Editor build",
      },
    ],
    serviceToken: {
      masked: "svc_live_••••••••••••7b21",
      lastRotated: tier === "enterprise" ? "11 days ago" : "34 days ago",
    },
    offlineActivationAvailable: tier === "enterprise",
  };
}

export function buildEditorDeploymentResponse(
  tier: Tier,
): EditorDeploymentResponse {
  const instances = instancesFor(tier);
  return {
    summary: summaryFor(tier, instances),
    targets: targetsFor(tier),
    pairings: pairingsFor(tier),
    instances,
  };
}
