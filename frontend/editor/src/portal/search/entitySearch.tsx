import { PROCESSOR_SEARCH_INDEX } from "@app/data/processorSearchIndex";
import {
  PORTAL_ENTITY_SCOPE_DEFS,
  PORTAL_DOCS_SCOPE_ID,
  type SuperSearchGroup,
  type SuperSearchResult,
} from "@app/types/superSearch";
import { rankByFuzzy } from "@app/utils/fuzzySearch";
import { fetchPolicies, type CatalogueEntry } from "@portal/api/policies";
import { fetchPipelines, type PipelineView } from "@portal/api/pipelines";
import { fetchSources, type SourceView } from "@portal/api/sources";
import { fetchUsers, type Member } from "@portal/api/users";
import {
  DocsIcon,
  PipelinesIcon,
  PoliciesIcon,
  SourcesIcon,
  UsersIcon,
} from "@portal/components/icons";
import type { Tier } from "@portal/contexts/TierContext";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { allDocs, loadDocsNav } from "@portal/docs/manifest/registry";
import { searchDocs, toPlainText, type SearchDoc } from "@portal/docs/search";

/**
 * The Processor's entity search: users, policies, pipelines and sources,
 * fetched per scope and fuzzy-ranked client-side. Shared by both super search
 * hosts — the portal bar imports it statically, the editor bar loads it on
 * demand through the processorEntitySearch seam (a static import there would
 * pull the portal into the main bundle).
 */

export const PORTAL_ENTITY_SCOPE_IDS = PORTAL_ENTITY_SCOPE_DEFS.map(
  (def) => def.id,
);

export type PortalEntityScopeId =
  (typeof PORTAL_ENTITY_SCOPE_DEFS)[number]["id"];

export type PortalEntityItems =
  | Member[]
  | CatalogueEntry[]
  | PipelineView[]
  | SourceView[];

export interface ProcessorEntities {
  users: Member[];
  policies: CatalogueEntry[];
  pipelines: PipelineView[];
  sources: SourceView[];
}

/**
 * How many results each entity ranker computes — the ceiling the dropdown's
 * "show more" can reveal (the component shows a small initial slice).
 */
export const ENTITY_GROUP_LIMIT = 24;

/** How long a fetched entity scope stays fresh before a search refetches it. */
export const ENTITY_REFRESH_MS = 30_000;

const PORTAL_VIEW_BY_SCOPE_ID = Object.fromEntries(
  PORTAL_ENTITY_SCOPE_DEFS.map((def) => [def.id, def.viewId]),
) as Record<PortalEntityScopeId, string>;

const VISIBLE_PORTAL_VIEW_IDS = new Set(
  PROCESSOR_SEARCH_INDEX.map((entry) => entry.id),
);

/** Whether the flavor's portal nav ships the view an entity scope targets. */
export function isVisiblePortalScope(scopeId: PortalEntityScopeId): boolean {
  return VISIBLE_PORTAL_VIEW_IDS.has(PORTAL_VIEW_BY_SCOPE_ID[scopeId]);
}

/** Whether this build ships the in-app developer docs (so they're searchable). */
export function isDocsSearchable(): boolean {
  return VISIBLE_PORTAL_VIEW_IDS.has("docs");
}

// The docs manifest is static (bundled JSON), so the full-text index — the
// plaintext strip over every doc — is built once and reused across queries.
let docsSearchIndex: SearchDoc[] | null = null;
function getDocsSearchIndex(): SearchDoc[] {
  if (!docsSearchIndex) {
    const sectionLabels = new Map(loadDocsNav().map((s) => [s.id, s.label]));
    docsSearchIndex = allDocs().map((doc) => ({
      id: doc.id,
      title: doc.title,
      sectionLabel: sectionLabels.get(doc.section) ?? "",
      text: toPlainText(doc.markdown),
    }));
  }
  return docsSearchIndex;
}

export function rankDocsResults(
  trimmed: string,
  navigate: (path: string) => void,
  limit = ENTITY_GROUP_LIMIT,
): SuperSearchResult[] {
  if (!isDocsSearchable()) return [];
  return searchDocs(getDocsSearchIndex(), trimmed, limit).map((result) => ({
    key: `portal-doc:${result.id}`,
    group: PORTAL_DOCS_SCOPE_ID,
    title: result.title,
    // The matched-content snippet (full text is what makes docs worth
    // searching), falling back to the doc's section when the hit is title-only.
    subtitle:
      result.snippet
        .map((seg) => seg.text)
        .join("")
        .trim() || result.sectionLabel,
    icon: <DocsIcon />,
    score: result.score,
    onSelect: () => navigate(`${toPortalPath(VIEW_PATHS.docs)}#${result.id}`),
  }));
}

export function withPortalEntityDependencies(
  scopes: readonly PortalEntityScopeId[],
): readonly PortalEntityScopeId[] {
  // Pipeline rows must exclude policy-backed records, so they depend on the
  // policy catalogue even when the user only scoped into pipelines.
  if (
    !scopes.includes("portal-pipelines") ||
    scopes.includes("portal-policies")
  ) {
    return scopes;
  }
  return [...scopes, "portal-policies"];
}

/** Every entity scope the flavor ships, dependencies included — the request
 * set for an unscoped search. */
export function defaultPortalEntityScopes(): readonly PortalEntityScopeId[] {
  return withPortalEntityDependencies(
    PORTAL_ENTITY_SCOPE_IDS.filter((scopeId) => isVisiblePortalScope(scopeId)),
  );
}

/** One entity scope's fetch. `tier` shapes only presentational fields on the
 * users payload, never the lists — hosts without a TierContext pass "free". */
export async function fetchPortalEntityScope(
  scopeId: PortalEntityScopeId,
  tier: Tier,
): Promise<PortalEntityItems> {
  switch (scopeId) {
    case "portal-users":
      return (await fetchUsers(tier)).members;
    case "portal-policies":
      return (await fetchPolicies()).catalogue;
    case "portal-pipelines":
      return (await fetchPipelines()).pipelines;
    case "portal-sources":
      return (await fetchSources()).sources;
  }
}

/** Assembles per-scope cache values into the typed entity sets. The casts are
 * sound because fetchPortalEntityScope keys each item type to its scope. */
export function toProcessorEntities(
  values: Partial<Record<PortalEntityScopeId, PortalEntityItems>>,
): ProcessorEntities {
  return {
    users: (values["portal-users"] as Member[] | undefined) ?? [],
    policies: (values["portal-policies"] as CatalogueEntry[] | undefined) ?? [],
    pipelines: (values["portal-pipelines"] as PipelineView[] | undefined) ?? [],
    sources: (values["portal-sources"] as SourceView[] | undefined) ?? [],
  };
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function policyResultTitle(entry: CatalogueEntry, t: Translate) {
  const category = t(entry.category.label);
  return entry.policy
    ? t("portal.policies.defaultName", { category })
    : category;
}

export function rankPortalPolicyResults(
  entries: CatalogueEntry[],
  trimmed: string,
  t: Translate,
  openPolicy: (categoryId: string) => void,
  limit = ENTITY_GROUP_LIMIT,
): SuperSearchResult[] {
  return rankByFuzzy(
    entries.filter((entry) => !entry.category.comingSoon),
    trimmed,
    [
      (entry) => policyResultTitle(entry, t),
      (entry) => t(entry.category.label),
      (entry) => t(entry.category.desc),
    ],
  )
    .slice(0, limit)
    .map(({ item, score }) => ({
      key: `portal-policy:${item.category.id}`,
      group: "portal-policies",
      title: policyResultTitle(item, t),
      subtitle: t(item.category.desc),
      icon: <PoliciesIcon />,
      score,
      onSelect: () => openPolicy(item.category.id),
    }));
}

export function rankPortalPipelineResults(
  entries: PipelineView[],
  trimmed: string,
  excludedIds: ReadonlySet<string>,
  openPipeline: (pipelineId: string) => void,
  limit = ENTITY_GROUP_LIMIT,
): SuperSearchResult[] {
  return rankByFuzzy(
    entries.filter((entry) => !excludedIds.has(entry.id)),
    trimmed,
    [(entry) => entry.name, (entry) => entry.trigger],
  )
    .slice(0, limit)
    .map(({ item, score }) => ({
      key: `portal-pipeline:${item.id}`,
      group: "portal-pipelines",
      title: item.name,
      subtitle: item.trigger,
      icon: <PipelinesIcon />,
      score,
      onSelect: () => openPipeline(item.id),
    }));
}

export interface BuildEntityGroupsOptions {
  /** Host scope filter; defaults to every scope enabled. */
  scopeEnabled?: (scopeId: string) => boolean;
}

/**
 * Ranks the entity sets into display groups. Selects navigate to the entity's
 * portal route (deep links where the views support them) — the portal is a
 * route-set of the same SPA, so this works from either app.
 */
export function buildProcessorEntityGroups(
  entities: ProcessorEntities,
  trimmed: string,
  t: Translate,
  navigate: (path: string) => void,
  options: BuildEntityGroupsOptions = {},
): SuperSearchGroup[] {
  if (!trimmed) return [];
  const scopeEnabled = options.scopeEnabled ?? (() => true);
  const groups: SuperSearchGroup[] = [];

  const includeScope = (scopeId: PortalEntityScopeId) =>
    isVisiblePortalScope(scopeId) && scopeEnabled(scopeId);

  const users = includeScope("portal-users")
    ? rankByFuzzy(entities.users, trimmed, [
        (member) => member.name,
        (member) => member.email,
      ])
        .slice(0, ENTITY_GROUP_LIMIT)
        .map(({ item, score }) => ({
          key: `portal-user:${item.id}`,
          group: "portal-users",
          title: item.name,
          subtitle: item.email,
          icon: <UsersIcon />,
          score,
          onSelect: () =>
            navigate(
              `${toPortalPath(VIEW_PATHS.users)}?member=${encodeURIComponent(item.id)}`,
            ),
        }))
    : [];
  if (users.length > 0) {
    groups.push({
      id: "portal-users",
      label: t("portal.nav.users"),
      results: users,
    });
  }

  const policies = includeScope("portal-policies")
    ? rankPortalPolicyResults(
        entities.policies,
        trimmed,
        t,
        (categoryId) =>
          navigate(
            `${toPortalPath(VIEW_PATHS.policies)}?category=${encodeURIComponent(categoryId)}`,
          ),
        ENTITY_GROUP_LIMIT,
      )
    : [];
  if (policies.length > 0) {
    groups.push({
      id: "portal-policies",
      label: t("portal.nav.policies"),
      results: policies,
    });
  }

  // Policy-backed pipelines already surface as policies; listing them twice
  // under different names would read as duplicates.
  const policyPipelineIds = new Set(
    entities.policies.flatMap((entry) =>
      entry.policy?.state.backendId ? [entry.policy.state.backendId] : [],
    ),
  );
  const pipelines = includeScope("portal-pipelines")
    ? rankPortalPipelineResults(
        entities.pipelines,
        trimmed,
        policyPipelineIds,
        (pipelineId) =>
          navigate(`${toPortalPath(VIEW_PATHS.pipelines)}/${pipelineId}`),
        ENTITY_GROUP_LIMIT,
      )
    : [];
  if (pipelines.length > 0) {
    groups.push({
      id: "portal-pipelines",
      label: t("portal.nav.pipelines"),
      results: pipelines,
    });
  }

  const sources = includeScope("portal-sources")
    ? rankByFuzzy(entities.sources, trimmed, [
        (source) => source.name,
        (source) => source.type,
      ])
        .slice(0, ENTITY_GROUP_LIMIT)
        .map(({ item, score }) => ({
          key: `portal-source:${item.id}`,
          group: "portal-sources",
          title: item.name,
          subtitle: item.type,
          icon: <SourcesIcon />,
          score,
          onSelect: () =>
            navigate(`${toPortalPath(VIEW_PATHS.sources)}/${item.id}`),
        }))
    : [];
  if (sources.length > 0) {
    groups.push({
      id: "portal-sources",
      label: t("portal.nav.sources"),
      results: sources,
    });
  }

  const docs =
    isDocsSearchable() && scopeEnabled(PORTAL_DOCS_SCOPE_ID)
      ? rankDocsResults(trimmed, navigate, ENTITY_GROUP_LIMIT)
      : [];
  if (docs.length > 0) {
    groups.push({
      id: PORTAL_DOCS_SCOPE_ID,
      label: t("superSearch.group.docs"),
      results: docs,
    });
  }

  return groups;
}
