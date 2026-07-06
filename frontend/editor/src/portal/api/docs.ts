import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";
import type { DocsContent, DocsNavSection } from "@portal/mocks/docs";

export type {
  AgentSkill,
  ApiErrorRow,
  CodeSample,
  DocsContent,
  DocsNavItem,
  DocsNavSection,
  EmbedComponent,
  Playbook,
  RateLimit,
  Sdk,
  SdkStatus,
} from "@portal/mocks/docs";

/** GET /v1/docs/nav — the docs nav tree. */
export async function fetchDocsNav(): Promise<DocsNavSection[]> {
  return apiClient.local.json<DocsNavSection[]>("/v1/docs/nav");
}

/** GET /v1/docs/content — the tier-scaled reference content. */
export async function fetchDocsContent(tier: Tier): Promise<DocsContent> {
  return apiClient.local.json<DocsContent>(`/v1/docs/content?tier=${tier}`);
}
