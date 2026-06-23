/**
 * Agent Builder fixtures and the types api/agents.ts shares with them.
 *
 * An "agent" here is an AI agent that classifies, extracts from, and routes
 * documents. The builder is its lifecycle surface: scenarios (named test
 * cases), tool-access governance, an eval / golden set, and version history.
 *
 * api/agents.ts imports the types; the MSW handlers serve this fixture data
 * over the intercepted httpJson() calls. Components never reach into this
 * module directly. Once a real backend exists the handlers stop being
 * registered and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Domain types                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

export type AgentStatus = "draft" | "published";

/**
 * Tool-access posture. `broad` lets the agent call any tool it can reach;
 * `restricted` is allow-by-default minus an explicit deny list (the governance
 * mode enterprise tenants use to fence agents away from sensitive tools).
 */
export type ToolMode = "broad" | "restricted";

/** A named test case describing expected agent behaviour for a kind of input. */
export interface Scenario {
  id: string;
  name: string;
  /** What the agent is expected to do for this input. */
  expectation: string;
  /** Whether this scenario is currently exercised by the eval run. */
  enabled: boolean;
}

/** A single golden-set check with its last-run outcome. */
export interface EvalCase {
  id: string;
  name: string;
  /** Last observed pass/fail; null when the case has never been run. */
  passing: boolean | null;
  /** Mean latency of the last run in milliseconds. */
  latencyMs: number;
}

export interface AgentVersion {
  /** Display label, e.g. "v3" or "v2-draft". */
  version: string;
  status: AgentStatus;
  /** ISO timestamp the version was created. */
  createdAt: string;
  author: string;
  /** One-line change summary. */
  note: string;
}

export interface Agent {
  id: string;
  name: string;
  /** One-line role description shown under the name in the selector. */
  role: string;
  status: AgentStatus;
  /** Current working version, e.g. "v3" or "v2-draft". */
  version: string;
  model: string;
  scenarios: Scenario[];
  toolMode: ToolMode;
  /** Tools the agent may not call when `toolMode` is "restricted". */
  deniedTools: string[];
  /** Count of golden-set cases currently passing. */
  evalsPassing: number;
  /** Total golden-set cases. */
  evalsTotal: number;
  evalCases: EvalCase[];
  versions: AgentVersion[];
}

export interface AgentsSummary {
  /** Agents in the "published" state. */
  activeAgents: number;
  /** Total agents regardless of status. */
  totalAgents: number;
  /** Mean eval pass-rate across all agents, 0..1. */
  avgPassRate: number;
  /** Total scenarios across all agents. */
  totalScenarios: number;
  /** Latest published version label across the fleet, e.g. "v3". */
  latestPublished: string;
}

export interface AgentsResponse {
  summary: AgentsSummary;
  agents: Agent[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Presentation metadata (chip tone per status). Product copy, client-side. */
/* ──────────────────────────────────────────────────────────────────────── */

export const AGENT_STATUS_TONE: Record<AgentStatus, "success" | "neutral"> = {
  published: "success",
  draft: "neutral",
};

/**
 * Catalogue of tools an agent can be granted or denied. Surfaced as the chip
 * palette in restricted mode so the deny list is picked from a known set
 * rather than free-typed.
 */
export const TOOL_CATALOGUE = [
  "extract.fields",
  "classify.document",
  "route.pipeline",
  "lookup.crm",
  "send.email",
  "write.audit",
  "read.pii",
  "invoke.webhook",
] as const;

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixture builders                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

const CONTRACT_ROUTER: Agent = {
  id: "agent-contract-router",
  name: "Contract Router",
  role: "Classifies inbound contracts and routes to the right review queue",
  status: "published",
  version: "v3",
  model: "claude-opus-4.1",
  toolMode: "restricted",
  deniedTools: ["send.email", "read.pii"],
  evalsPassing: 23,
  evalsTotal: 24,
  scenarios: [
    {
      id: "sc-cr-1",
      name: "New customer file",
      expectation: "Route to onboarding queue and tag as net-new account",
      enabled: true,
    },
    {
      id: "sc-cr-2",
      name: "Renewal with price change",
      expectation: "Flag the delta and route to legal for redline review",
      enabled: true,
    },
    {
      id: "sc-cr-3",
      name: "Non-standard liability clause",
      expectation: "Escalate to senior counsel rather than auto-approving",
      enabled: true,
    },
  ],
  evalCases: [
    {
      id: "ec-cr-1",
      name: "MSA — standard terms",
      passing: true,
      latencyMs: 1840,
    },
    {
      id: "ec-cr-2",
      name: "MSA — capped liability",
      passing: true,
      latencyMs: 2010,
    },
    {
      id: "ec-cr-3",
      name: "Order form — multi-year",
      passing: true,
      latencyMs: 1620,
    },
    {
      id: "ec-cr-4",
      name: "DPA — cross-border transfer",
      passing: false,
      latencyMs: 2440,
    },
  ],
  versions: [
    {
      version: "v3",
      status: "published",
      createdAt: "2026-05-28T14:12:00Z",
      author: "legal-ops@acme.com",
      note: "Added cross-border DPA detection",
    },
    {
      version: "v2",
      status: "published",
      createdAt: "2026-04-09T09:30:00Z",
      author: "legal-ops@acme.com",
      note: "Tightened renewal price-change routing",
    },
    {
      version: "v1",
      status: "published",
      createdAt: "2026-02-15T16:45:00Z",
      author: "you@acme.com",
      note: "Initial publish",
    },
  ],
};

const INVOICE_AGENT: Agent = {
  id: "agent-invoice",
  name: "Invoice Agent",
  role: "Extracts line items and routes invoices into the AP pipeline",
  status: "published",
  version: "v5",
  model: "claude-sonnet-4.5",
  toolMode: "broad",
  deniedTools: [],
  evalsPassing: 31,
  evalsTotal: 32,
  scenarios: [
    {
      id: "sc-inv-1",
      name: "Multi-page invoice",
      expectation: "Extract all line items across pages into one record",
      enabled: true,
    },
    {
      id: "sc-inv-2",
      name: "Foreign currency total",
      expectation: "Preserve original currency and attach FX note",
      enabled: true,
    },
    {
      id: "sc-inv-3",
      name: "Missing PO number",
      expectation: "Route to manual matching rather than auto-posting",
      enabled: false,
    },
  ],
  evalCases: [
    { id: "ec-inv-1", name: "Single-page USD", passing: true, latencyMs: 980 },
    { id: "ec-inv-2", name: "Multi-page EUR", passing: true, latencyMs: 1320 },
    {
      id: "ec-inv-3",
      name: "Handwritten total",
      passing: true,
      latencyMs: 1510,
    },
    {
      id: "ec-inv-4",
      name: "No PO reference",
      passing: false,
      latencyMs: 1100,
    },
  ],
  versions: [
    {
      version: "v5",
      status: "published",
      createdAt: "2026-06-01T11:00:00Z",
      author: "platform@acme.com",
      note: "FX note extraction for foreign-currency invoices",
    },
    {
      version: "v4",
      status: "published",
      createdAt: "2026-05-10T08:20:00Z",
      author: "platform@acme.com",
      note: "Multi-page line-item stitching",
    },
  ],
};

const KYC_AGENT: Agent = {
  id: "agent-kyc",
  name: "KYC Agent",
  role: "Verifies identity documents and flags compliance gaps",
  status: "draft",
  version: "v2-draft",
  model: "claude-sonnet-4.5",
  toolMode: "restricted",
  deniedTools: ["send.email", "invoke.webhook"],
  evalsPassing: 14,
  evalsTotal: 20,
  scenarios: [
    {
      id: "sc-kyc-1",
      name: "KYC question",
      expectation: "Answer from the verified document set, never invent facts",
      enabled: true,
    },
    {
      id: "sc-kyc-2",
      name: "Expired identity document",
      expectation: "Mark verification as failed and request a fresh document",
      enabled: true,
    },
    {
      id: "sc-kyc-3",
      name: "Compliance escalation",
      expectation: "Escalate sanctions-list hits to the compliance officer",
      enabled: true,
    },
  ],
  evalCases: [
    { id: "ec-kyc-1", name: "Valid passport", passing: true, latencyMs: 2200 },
    { id: "ec-kyc-2", name: "Expired licence", passing: true, latencyMs: 2050 },
    {
      id: "ec-kyc-3",
      name: "Sanctions-list match",
      passing: false,
      latencyMs: 2600,
    },
    {
      id: "ec-kyc-4",
      name: "Mismatched name fields",
      passing: false,
      latencyMs: 2310,
    },
  ],
  versions: [
    {
      version: "v2-draft",
      status: "draft",
      createdAt: "2026-06-12T13:40:00Z",
      author: "risk@acme.com",
      note: "Sanctions-list escalation path (in review)",
    },
    {
      version: "v1",
      status: "published",
      createdAt: "2026-03-22T10:15:00Z",
      author: "risk@acme.com",
      note: "Initial publish",
    },
  ],
};

/**
 * Enterprise-only agent — governance-heavy and exercised against a larger
 * golden set than the base tenants get, so it only appears for that tier.
 */
const COMPLIANCE_SWEEP: Agent = {
  id: "agent-compliance-sweep",
  name: "Compliance Sweep",
  role: "Audits processed documents against retention and PII policy",
  status: "published",
  version: "v4",
  model: "claude-opus-4.1",
  toolMode: "restricted",
  deniedTools: ["send.email", "route.pipeline", "invoke.webhook"],
  evalsPassing: 58,
  evalsTotal: 60,
  scenarios: [
    {
      id: "sc-cs-1",
      name: "Over-retention detection",
      expectation: "Flag documents held past their retention window",
      enabled: true,
    },
    {
      id: "sc-cs-2",
      name: "Unredacted PII",
      expectation: "Quarantine and write an audit entry, never auto-delete",
      enabled: true,
    },
  ],
  evalCases: [
    {
      id: "ec-cs-1",
      name: "Expired retention",
      passing: true,
      latencyMs: 3100,
    },
    { id: "ec-cs-2", name: "SSN in free text", passing: true, latencyMs: 2900 },
    {
      id: "ec-cs-3",
      name: "Redacted re-share",
      passing: true,
      latencyMs: 2700,
    },
    {
      id: "ec-cs-4",
      name: "Cross-region copy",
      passing: false,
      latencyMs: 3300,
    },
  ],
  versions: [
    {
      version: "v4",
      status: "published",
      createdAt: "2026-06-03T15:05:00Z",
      author: "compliance@acme.com",
      note: "Cross-region copy detection",
    },
    {
      version: "v3",
      status: "published",
      createdAt: "2026-05-01T12:00:00Z",
      author: "compliance@acme.com",
      note: "Retention-window policy refresh",
    },
    {
      version: "v2",
      status: "published",
      createdAt: "2026-03-14T09:00:00Z",
      author: "compliance@acme.com",
      note: "PII quarantine workflow",
    },
    {
      version: "v1",
      status: "published",
      createdAt: "2026-01-20T08:00:00Z",
      author: "you@acme.com",
      note: "Initial publish",
    },
  ],
};

/**
 * On the free tier a single starter agent ships as a draft so the surface has
 * something to render, but with an empty golden set and no version history —
 * evals and version governance are paid capabilities.
 */
const STARTER_AGENT: Agent = {
  id: "agent-starter",
  name: "Starter Classifier",
  role: "Sorts uploads into a handful of document types",
  status: "draft",
  version: "v1-draft",
  model: "claude-haiku-4.5",
  toolMode: "broad",
  deniedTools: [],
  evalsPassing: 0,
  evalsTotal: 0,
  scenarios: [
    {
      id: "sc-st-1",
      name: "Unknown document type",
      expectation: "Fall back to the inbox queue instead of guessing",
      enabled: true,
    },
  ],
  evalCases: [],
  versions: [
    {
      version: "v1-draft",
      status: "draft",
      createdAt: "2026-06-14T17:30:00Z",
      author: "you@acme.com",
      note: "Draft — not yet published",
    },
  ],
};

const PRO_AGENTS: Agent[] = [CONTRACT_ROUTER, INVOICE_AGENT, KYC_AGENT];

/**
 * Trim an agent to the free-tier shape: drop the eval golden set and collapse
 * version history to the current version, mirroring the capability gating the
 * KPI strip advertises.
 */
function toFreeShape(agent: Agent): Agent {
  return {
    ...agent,
    status: "draft",
    evalsPassing: 0,
    evalsTotal: 0,
    evalCases: [],
    versions: agent.versions.slice(0, 1),
  };
}

/** Agents for a given tier. */
export function agentsFor(tier: Tier): Agent[] {
  if (tier === "free") return [toFreeShape(STARTER_AGENT)];
  if (tier === "enterprise") return [...PRO_AGENTS, COMPLIANCE_SWEEP];
  return PRO_AGENTS;
}

function summaryFor(agents: Agent[]): AgentsSummary {
  const published = agents.filter((a) => a.status === "published");
  const totalScenarios = agents.reduce((n, a) => n + a.scenarios.length, 0);

  // Pass-rate is meaningless without a golden set, so average only over agents
  // that actually have eval cases — free tenants land at 0.
  const withEvals = agents.filter((a) => a.evalsTotal > 0);
  const avgPassRate =
    withEvals.length === 0
      ? 0
      : withEvals.reduce((sum, a) => sum + a.evalsPassing / a.evalsTotal, 0) /
        withEvals.length;

  const latestPublished = published.length > 0 ? published[0].version : "—";

  return {
    activeAgents: published.length,
    totalAgents: agents.length,
    avgPassRate,
    totalScenarios,
    latestPublished,
  };
}

export function buildAgentsResponse(tier: Tier): AgentsResponse {
  const agents = agentsFor(tier);
  return { summary: summaryFor(agents), agents };
}
