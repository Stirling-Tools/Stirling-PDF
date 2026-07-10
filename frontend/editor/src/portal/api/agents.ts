import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * An "agent" here is an AI agent that classifies, extracts from, and routes
 * documents. The builder is its lifecycle surface: scenarios (named test
 * cases), tool-access governance, an eval / golden set, and version history.
 */

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
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

/** GET /v1/agents?tier=… — fleet summary + every agent with its full builder state. */
export async function fetchAgents(tier: Tier): Promise<AgentsResponse> {
  return apiClient.local.json<AgentsResponse>(
    `/v1/agents?tier=${encodeURIComponent(tier)}`,
  );
}
