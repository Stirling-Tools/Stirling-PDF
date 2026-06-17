import { httpJson } from "@portal/api/http";
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

/** GET /api/v1/docs/nav — the docs nav tree. */
export async function fetchDocsNav(): Promise<DocsNavSection[]> {
  return httpJson<DocsNavSection[]>("/api/v1/docs/nav");
}

/** GET /api/v1/docs/content — the tier-scaled reference content. */
export async function fetchDocsContent(tier: Tier): Promise<DocsContent> {
  return httpJson<DocsContent>(`/api/v1/docs/content?tier=${tier}`);
}
