import { apiClient } from "@portal/api/http";
import type { CardAccent, CodeLang } from "@app/ui";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * Developer Docs. Two payloads back the surface: the left-hand nav tree and
 * the data-driven reference content — code samples, SDK matrix, embeddable
 * components, playbooks, agent skills, the error table, and the tier-scaled
 * rate-limit grid.
 */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Navigation                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

/** A leaf entry in the docs nav — maps 1:1 to a content section. */
export interface DocsNavItem {
  /** Stable id used as the in-page section anchor. */
  id: string;
  label: string;
  /** Optional badge shown to the right of the label (e.g. "New", "Beta"). */
  badge?: string;
}

/** A top-level grouping in the docs nav tree. */
export interface DocsNavSection {
  id: string;
  label: string;
  /** Single-glyph icon shown beside the section header. */
  icon: string;
  items: DocsNavItem[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Reference content                                                        */
/* ──────────────────────────────────────────────────────────────────────── */

/** One tab in a multi-language code snippet. */
export interface CodeSample {
  /** Stable key used as the snippet tab id. */
  key: string;
  label: string;
  lang: CodeLang;
  code: string;
}

/** Per-tier request ceilings rendered by the rate-limits section. */
export interface RateLimit {
  rpm: string;
  burst: string;
  concurrency: string;
}

/** A single HTTP status row in the error table. */
export interface ApiErrorRow {
  code: string;
  /** Severity colour — amber for recoverable, red for hard failures. */
  tone: "amber" | "red";
  meaning: string;
}

export type SdkStatus = "ga" | "beta" | "deprecated";

/** An official client library in the SDK matrix. */
export interface Sdk {
  name: string;
  /** Single-glyph icon shown beside the name. */
  icon: string;
  install: string;
  lang: CodeLang;
  status: SdkStatus;
}

/** An embeddable UI component in the drop-in viewer library. */
export interface EmbedComponent {
  name: string;
  blurb: string;
  /** Stack tag, e.g. "React" or "Web". */
  tag: string;
}

/** A copy-paste, end-to-end pipeline recipe. */
export interface Playbook {
  title: string;
  blurb: string;
  /** Ordered stages rendered as a chip flow. */
  steps: string[];
  accent: CardAccent;
}

/** A bundled, named agent capability — a deterministic op chain. */
export interface AgentSkill {
  name: string;
  blurb: string;
  /** Op chain shown as a mono string, e.g. "extract · validate". */
  ops: string;
}

/** The complete data-driven docs payload for one tier. */
export interface DocsContent {
  quickstartSamples: CodeSample[];
  quickstartResponse: string;
  rateLimit: RateLimit;
  errors: ApiErrorRow[];
  sdks: Sdk[];
  components: EmbedComponent[];
  playbooks: Playbook[];
  skills: AgentSkill[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

/** GET /v1/docs/nav — the docs nav tree. */
export async function fetchDocsNav(): Promise<DocsNavSection[]> {
  return apiClient.local.json<DocsNavSection[]>("/v1/docs/nav");
}

/** GET /v1/docs/content — the tier-scaled reference content. */
export async function fetchDocsContent(tier: Tier): Promise<DocsContent> {
  return apiClient.local.json<DocsContent>(`/v1/docs/content?tier=${tier}`);
}
