import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { withBasePath } from "@app/constants/app";
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
  useSearchScopeFilter,
} from "@app/hooks/useSuperSearch";
import { useScopedFetchCache } from "@app/hooks/useScopedFetchCache";
import type {
  SuperSearchGates,
  SuperSearchGroup,
  SuperSearchGroupId,
  SuperSearchQueryOptions,
  SuperSearchScope,
  UseSuperSearchResult,
} from "@app/types/superSearch";
import type { ToolId } from "@app/types/toolId";
import { EDITOR_IS_SAME_APP, EDITOR_URL } from "@portal/auth/editorUrl";
import { useTier } from "@portal/contexts/TierContext";
import { useUI } from "@portal/contexts/UIContext";
import {
  ENTITY_GROUP_LIMIT,
  ENTITY_REFRESH_MS,
  PORTAL_ENTITY_SCOPE_IDS,
  buildProcessorEntityGroups,
  defaultPortalEntityScopes,
  fetchPortalEntityScope,
  isVisiblePortalScope,
  toProcessorEntities,
  withPortalEntityDependencies,
  type PortalEntityScopeId,
} from "@portal/search/entitySearch";

const FOCUSED_ENTITY_GROUP_LIMIT = 8;
const FOCUSED_SHARED_GROUP_LIMIT = 8;
const EDITOR_GROUP_ORDER: SuperSearchGroupId[] = ["tools"];
const PROCESSOR_GROUP_ORDER: SuperSearchGroupId[] = ["settings"];
const PROCESSOR_SECTION_LABEL_KEY = "superSearch.group.processor";
const PROCESSOR_SECTION_LABEL_FALLBACK = "Processor";
const EDITOR_SECTION_LABEL_KEY = "portal.nav.editor";
const EDITOR_SECTION_LABEL_FALLBACK = "Editor";
const NO_PORTAL_ENTITY_SCOPES: readonly PortalEntityScopeId[] = [];

/**
 * Tool results live in the editor app, so selecting one is a full page load
 * there (the editor initialises its tool state from the URL on boot —
 * client-side routing can't reach that init once mounted).
 */
function editorHref(path: string): string {
  if (EDITOR_IS_SAME_APP) return withBasePath(path);
  return EDITOR_URL.replace(/\/$/, "") + path;
}

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
      ].filter((scope) =>
        (PORTAL_ENTITY_SCOPE_IDS as readonly string[]).includes(scope.id)
          ? isVisiblePortalScope(scope.id as PortalEntityScopeId)
          : true,
      ),
    [t],
  );
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
  const { tier } = useTier();

  const trimmed = query.trim();
  const { scopeEnabled, focusedScopeId } = useSearchScopeFilter(options);
  const sharedScopeLimit = useCallback(
    (scopeId: SuperSearchGroupId) =>
      focusedScopeId === scopeId ? FOCUSED_SHARED_GROUP_LIMIT : undefined,
    [focusedScopeId],
  );
  const entityScopeLimit = useCallback(
    (scopeId: string) =>
      focusedScopeId === scopeId
        ? FOCUSED_ENTITY_GROUP_LIMIT
        : ENTITY_GROUP_LIMIT,
    [focusedScopeId],
  );

  const requestedEntityScopes = useMemo<readonly PortalEntityScopeId[]>(() => {
    if (!active || trimmed.length === 0) return NO_PORTAL_ENTITY_SCOPES;
    const enabled = defaultPortalEntityScopes().filter((scopeId) =>
      scopeEnabled(scopeId),
    );
    return withPortalEntityDependencies(enabled);
  }, [active, scopeEnabled, trimmed]);

  const fetchEntityScope = useCallback(
    (scopeId: PortalEntityScopeId) => fetchPortalEntityScope(scopeId, tier),
    [tier],
  );
  const { values: entityValues, loading: loadingEntities } =
    useScopedFetchCache(
      requestedEntityScopes,
      fetchEntityScope,
      ENTITY_REFRESH_MS,
    );
  const entities = useMemo(
    () => toProcessorEntities(entityValues),
    [entityValues],
  );

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
    (section: string, anchor?: string) => openSettings(section, anchor),
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

  const entityGroups = useMemo<SuperSearchGroup[]>(
    () =>
      buildProcessorEntityGroups(entities, trimmed, t, navigate, {
        scopeEnabled,
        limitFor: entityScopeLimit,
      }),
    [entities, trimmed, t, navigate, scopeEnabled, entityScopeLimit],
  );

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
