import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { withBasePath } from "@app/constants/app";
import { PROCESSOR_SEARCH_INDEX } from "@app/data/processorSearchIndex";
import {
  getToolUrlPath,
  isComingSoonTool,
  type ToolRegistry,
} from "@app/data/toolsTaxonomy";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import {
  assembleSuperSearchGroups,
  rankSettingsResults,
  rankToolResults,
  type SuperSearchGates,
  type SuperSearchGroup,
  type SuperSearchGroupId,
  type SuperSearchQueryOptions,
  type SuperSearchResult,
  type SuperSearchScope,
  type UseSuperSearchResult,
} from "@app/hooks/useSuperSearch";
import type { ToolId } from "@app/types/toolId";
import { rankByFuzzy } from "@app/utils/fuzzySearch";
import { EDITOR_IS_SAME_APP, EDITOR_URL } from "@portal/auth/editorUrl";
import { fetchPolicies, type CatalogueEntry } from "@portal/api/policies";
import { fetchPipelines, type PipelineView } from "@portal/api/pipelines";
import { fetchSources, type SourceView } from "@portal/api/sources";
import { fetchUsers, type Member } from "@portal/api/users";
import {
  PipelinesIcon,
  PoliciesIcon,
  SourcesIcon,
  UsersIcon,
} from "@portal/components/icons";
import { useTier } from "@portal/contexts/TierContext";
import { useUI } from "@portal/contexts/UIContext";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";

/** Entity groups cap lower than the shared group limit so the portal dropdown
 * stays scannable when several sections match at once. */
const ENTITY_GROUP_LIMIT = 4;
const FOCUSED_ENTITY_GROUP_LIMIT = 8;
const FOCUSED_SHARED_GROUP_LIMIT = 8;
const PORTAL_ENTITY_SCOPE_IDS = [
  "portal-users",
  "portal-policies",
  "portal-pipelines",
  "portal-sources",
] as const;
const EDITOR_GROUP_ORDER: SuperSearchGroupId[] = ["tools"];
const PROCESSOR_GROUP_ORDER: SuperSearchGroupId[] = ["settings"];
const PROCESSOR_SECTION_LABEL_KEY = "superSearch.group.processor";
const PROCESSOR_SECTION_LABEL_FALLBACK = "Processor";
const EDITOR_SECTION_LABEL_KEY = "portal.nav.editor";
const EDITOR_SECTION_LABEL_FALLBACK = "Editor";
const VISIBLE_PORTAL_VIEW_IDS = new Set(
  PROCESSOR_SEARCH_INDEX.map((entry) => entry.id),
);
const PORTAL_VIEW_BY_SCOPE_ID = {
  "portal-users": "users",
  "portal-policies": "policies",
  "portal-pipelines": "pipelines",
  "portal-sources": "sources",
} as const;

type PortalEntityScopeId = (typeof PORTAL_ENTITY_SCOPE_IDS)[number];

/**
 * Tool results live in the editor app, so selecting one is a full page load
 * there (the editor initialises its tool state from the URL on boot —
 * client-side routing can't reach that init once mounted).
 */
function editorHref(path: string): string {
  if (EDITOR_IS_SAME_APP) return withBasePath(path);
  return EDITOR_URL.replace(/\/$/, "") + path;
}

function isVisiblePortalScope(scopeId: PortalEntityScopeId): boolean {
  return VISIBLE_PORTAL_VIEW_IDS.has(PORTAL_VIEW_BY_SCOPE_ID[scopeId]);
}

interface PortalEntities {
  users: Member[];
  policies: CatalogueEntry[];
  pipelines: PipelineView[];
  sources: SourceView[];
}

const NO_ENTITIES: PortalEntities = {
  users: [],
  policies: [],
  pipelines: [],
  sources: [],
};

export function usePortalSearchScopes(): SuperSearchScope[] {
  const { t } = useTranslation();

  return useMemo(
    () =>
      [
        {
          id: "portal-policies",
          label: t("portal.nav.policies"),
          aliases: ["policy", "policies"],
        },
        {
          id: "portal-pipelines",
          label: t("portal.nav.pipelines"),
          aliases: ["pipeline", "pipelines"],
        },
        {
          id: "portal-sources",
          label: t("portal.nav.sources"),
          aliases: ["source", "sources"],
        },
        {
          id: "portal-users",
          label: t("portal.nav.users"),
          aliases: ["user", "users", "member", "members"],
        },
        {
          id: "tools",
          label: t("superSearch.group.tools", "Tools"),
          aliases: ["tool", "tools"],
        },
        {
          id: "settings",
          label: t("superSearch.group.settings", "Settings"),
          aliases: ["setting", "settings"],
        },
      ].filter((scope) => {
        const viewId =
          PORTAL_VIEW_BY_SCOPE_ID[
            scope.id as keyof typeof PORTAL_VIEW_BY_SCOPE_ID
          ];
        return viewId ? VISIBLE_PORTAL_VIEW_IDS.has(viewId) : true;
      }),
    [t],
  );
}

function policyResultTitle(
  entry: CatalogueEntry,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const category = t(entry.category.label);
  return entry.policy
    ? t("portal.policies.defaultName", { category })
    : category;
}

export function rankPortalPolicyResults(
  entries: CatalogueEntry[],
  trimmed: string,
  t: (key: string, options?: Record<string, unknown>) => string,
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

/** How long a loaded entity snapshot stays fresh before a reopen refetches. */
const ENTITY_REFRESH_MS = 30_000;

/**
 * Loads the portal's searchable entities once the user starts typing (not on
 * bare focus — the user list is not free), then ranking happens client-side
 * per keystroke. allSettled so one failing endpoint (e.g. policies on a
 * backend without them) doesn't drop the rest.
 */
function usePortalEntities(enabled: boolean): {
  entities: PortalEntities;
  loading: boolean;
} {
  const { tier } = useTier();
  const [entities, setEntities] = useState<PortalEntities>(NO_ENTITIES);
  const [loading, setLoading] = useState(false);
  const lastFetchedRef = useRef(0);
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (Date.now() - lastFetchedRef.current < ENTITY_REFRESH_MS) return;
    lastFetchedRef.current = Date.now();
    let cancelled = false;
    if (!loadedOnceRef.current) setLoading(true);
    Promise.allSettled([
      fetchUsers(tier),
      fetchPolicies(),
      fetchPipelines(),
      fetchSources(),
    ]).then((settled) => {
      settled.forEach((result) => {
        // Expected on deployments without that endpoint; debug, not noise.
        if (result.status === "rejected") {
          console.debug(
            "[PortalSearch] entity source unavailable:",
            result.reason,
          );
        }
      });
      if (cancelled) return;
      const [users, policies, pipelines, sources] = settled;
      setEntities({
        users: users.status === "fulfilled" ? users.value.members : [],
        policies:
          policies.status === "fulfilled" ? policies.value.catalogue : [],
        pipelines:
          pipelines.status === "fulfilled" ? pipelines.value.pipelines : [],
        sources: sources.status === "fulfilled" ? sources.value.sources : [],
      });
      loadedOnceRef.current = true;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, tier]);

  return { entities, loading };
}

/**
 * The portal's results provider for the shared super search bar: files stay
 * editor-only, portal entity results are grouped under a Processor section,
 * and the shared tools/settings lanes sit under an Editor section. Portal page
 * routes themselves stay out of the portal search — once you're in the portal,
 * the entities are the useful targets.
 */
export function usePortalSearchResults(
  query: string,
  active: boolean,
  options?: SuperSearchQueryOptions,
): UseSuperSearchResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openSettings } = useUI();
  const { allTools } = useToolRegistry();
  const { config } = useAppConfig();

  const trimmed = query.trim();
  const scopedIds = useMemo(
    () => new Set(options?.scopeIds ?? []),
    [options?.scopeIds],
  );
  const hasScopedSearch = scopedIds.size > 0;
  const scopeEnabled = useCallback(
    (scopeId: string) => !hasScopedSearch || scopedIds.has(scopeId),
    [hasScopedSearch, scopedIds],
  );
  const sharedScopeLimit = useCallback(
    (scopeId: SuperSearchGroupId) =>
      hasScopedSearch && scopedIds.size === 1 && scopedIds.has(scopeId)
        ? FOCUSED_SHARED_GROUP_LIMIT
        : undefined,
    [hasScopedSearch, scopedIds],
  );
  const entityScopeLimit = useCallback(
    (scopeId: string) =>
      hasScopedSearch && scopedIds.size === 1 && scopedIds.has(scopeId)
        ? FOCUSED_ENTITY_GROUP_LIMIT
        : ENTITY_GROUP_LIMIT,
    [hasScopedSearch, scopedIds],
  );
  const shouldLoadEntities =
    active &&
    trimmed.length > 0 &&
    (!hasScopedSearch ||
      PORTAL_ENTITY_SCOPE_IDS.some(
        (scopeId) => scopedIds.has(scopeId) && isVisiblePortalScope(scopeId),
      ));
  const { entities, loading: loadingEntities } =
    usePortalEntities(shouldLoadEntities);

  // Match what the editor bar can actually open: drop coming-soon placeholders
  // (no component, no link) — cross-app navigation to one lands on a tool that
  // can't render.
  const searchableTools = useMemo(() => {
    const out: Partial<ToolRegistry> = {};
    for (const [id, tool] of Object.entries(allTools)) {
      if (tool && !isComingSoonTool(id, tool)) out[id as ToolId] = tool;
    }
    return out;
  }, [allTools]);

  const openTool = useCallback((id: ToolId) => {
    window.location.assign(editorHref(getToolUrlPath(id)));
  }, []);

  const openSettingsSection = useCallback(
    (section: string) => openSettings(section),
    [openSettings],
  );

  const gates = useMemo<SuperSearchGates | null>(
    () =>
      config
        ? {
            isAdmin: config.isAdmin ?? false,
            loginEnabled: config.enableLogin ?? false,
          }
        : null,
    [config],
  );

  const entityGroups = useMemo<SuperSearchGroup[]>(() => {
    if (!trimmed) return [];
    const groups: SuperSearchGroup[] = [];

    const users =
      isVisiblePortalScope("portal-users") && scopeEnabled("portal-users")
        ? rankByFuzzy(entities.users, trimmed, [
            (member) => member.name,
            (member) => member.email,
          ])
            .slice(0, entityScopeLimit("portal-users"))
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

    const policies =
      isVisiblePortalScope("portal-policies") && scopeEnabled("portal-policies")
        ? rankPortalPolicyResults(
            entities.policies,
            trimmed,
            t,
            (categoryId) =>
              navigate(
                `${toPortalPath(VIEW_PATHS.policies)}?category=${encodeURIComponent(categoryId)}`,
              ),
            entityScopeLimit("portal-policies"),
          )
        : [];
    if (policies.length > 0) {
      groups.push({
        id: "portal-policies",
        label: t("portal.nav.policies"),
        results: policies,
      });
    }

    const policyPipelineIds = new Set(
      entities.policies.flatMap((entry) =>
        entry.policy?.state.backendId ? [entry.policy.state.backendId] : [],
      ),
    );
    const pipelines =
      isVisiblePortalScope("portal-pipelines") &&
      scopeEnabled("portal-pipelines")
        ? rankPortalPipelineResults(
            entities.pipelines,
            trimmed,
            policyPipelineIds,
            (pipelineId) =>
              navigate(`${toPortalPath(VIEW_PATHS.pipelines)}/${pipelineId}`),
            entityScopeLimit("portal-pipelines"),
          )
        : [];
    if (pipelines.length > 0) {
      groups.push({
        id: "portal-pipelines",
        label: t("portal.nav.pipelines"),
        results: pipelines,
      });
    }

    const sources =
      isVisiblePortalScope("portal-sources") && scopeEnabled("portal-sources")
        ? rankByFuzzy(entities.sources, trimmed, [
            (source) => source.name,
            (source) => source.type,
          ])
            .slice(0, entityScopeLimit("portal-sources"))
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

    return groups;
  }, [entities, trimmed, t, navigate, scopeEnabled, entityScopeLimit]);

  const groups = useMemo(() => {
    const processorSettingsGroups = assembleSuperSearchGroups(
      {
        settings: scopeEnabled("settings")
          ? rankSettingsResults(
              trimmed,
              t,
              gates,
              openSettingsSection,
              sharedScopeLimit("settings"),
            )
          : [],
      },
      t,
      PROCESSOR_GROUP_ORDER,
    ).map((group) => ({
      ...group,
      sectionLabel: t(
        PROCESSOR_SECTION_LABEL_KEY,
        PROCESSOR_SECTION_LABEL_FALLBACK,
      ),
    }));

    const editorGroups = assembleSuperSearchGroups(
      {
        tools: scopeEnabled("tools")
          ? rankToolResults(
              searchableTools,
              trimmed,
              openTool,
              sharedScopeLimit("tools"),
            )
          : [],
      },
      t,
      EDITOR_GROUP_ORDER,
    ).map((group) => ({
      ...group,
      sectionLabel: t(EDITOR_SECTION_LABEL_KEY, EDITOR_SECTION_LABEL_FALLBACK),
    }));

    return [
      ...entityGroups.map((group) => ({
        ...group,
        sectionLabel: t(
          PROCESSOR_SECTION_LABEL_KEY,
          PROCESSOR_SECTION_LABEL_FALLBACK,
        ),
      })),
      ...processorSettingsGroups,
      ...editorGroups,
    ];
  }, [
    entityGroups,
    gates,
    openSettingsSection,
    openTool,
    scopeEnabled,
    searchableTools,
    sharedScopeLimit,
    t,
    trimmed,
  ]);

  const flatResults = useMemo(
    () => groups.flatMap((group) => group.results),
    [groups],
  );

  // loadingFiles doubles as "an async source is still loading" for the
  // dropdown's no-results gate — here that's the entity fetch.
  return { groups, flatResults, loadingFiles: loadingEntities };
}
