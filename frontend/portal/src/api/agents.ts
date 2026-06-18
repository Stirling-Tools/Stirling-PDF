import { httpJson } from "@portal/api/http";
import type { AgentsResponse } from "@portal/mocks/agents";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  Agent,
  AgentStatus,
  AgentVersion,
  AgentsResponse,
  AgentsSummary,
  EvalCase,
  Scenario,
  ToolMode,
} from "@portal/mocks/agents";
export { AGENT_STATUS_TONE, TOOL_CATALOGUE } from "@portal/mocks/agents";

/** GET /v1/agents?tier=… — fleet summary + every agent with its full builder state. */
export async function fetchAgents(tier: Tier): Promise<AgentsResponse> {
  return httpJson<AgentsResponse>(
    `/v1/agents?tier=${encodeURIComponent(tier)}`,
  );
}
