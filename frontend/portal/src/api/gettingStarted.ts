import { httpJson } from "@portal/api/http";
import type { GettingStartedResponse } from "@portal/mocks/gettingStarted";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  AnalysisStage,
  CodeSnippet,
  GettingStartedResponse,
  SnippetLang,
  UseCase,
  UseCaseAccent,
} from "@portal/mocks/gettingStarted";

/**
 * GET /v1/getting-started?tier=… — the onboarding funnel catalogue: use-case
 * cards, the analysis-stage labels, a sandbox API key, and per-language
 * snippets. Tier scales the use-case list and the rate limit shown in snippets.
 */
export async function fetchGettingStarted(
  tier: Tier,
): Promise<GettingStartedResponse> {
  return httpJson<GettingStartedResponse>(
    `/v1/getting-started?tier=${encodeURIComponent(tier)}`,
  );
}
