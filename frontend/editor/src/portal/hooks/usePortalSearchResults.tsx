import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getToolUrlPath,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { useToolAvailability } from "@app/hooks/useToolManagement";
import { useAccountCardShown } from "@app/hooks/useAccountCardShown";
import { useAuth } from "@app/auth";
import {
  useToolSearchAccess,
  type ToolSearchAccess,
} from "@app/hooks/useToolSearchAccess";
import { preferencesService } from "@app/services/preferencesService";
import {
  assembleSuperSearchGroups,
  isPortalEntityScopeOffered,
  rankSettingsResults,
  rankToolResults,
  useSearchScopeFilter,
} from "@app/hooks/useSuperSearch";
import {
  PORTAL_ENTITY_SCOPE_DEFS,
  PORTAL_DOCS_SCOPE_ID,
  type SuperSearchGates,
  type SuperSearchGroup,
  type SuperSearchGroupId,
  type SuperSearchQueryOptions,
  type SuperSearchScope,
  type UseSuperSearchResult,
} from "@app/types/superSearch";
import type { ToolId } from "@app/types/toolId";
import { assignLocation, openExternalUrl } from "@app/utils/safeNavigation";
import { usersBackend } from "@app/portal/usersBackend";
import {
  assemblePolicies,
  fetchPoliciesList,
  fetchPolicyRuns,
} from "@portal/api/policies";
import { fetchPipelines } from "@portal/api/pipelines";
import { fetchSources } from "@portal/api/sources";
import { EDITOR_IS_SAME_APP, EDITOR_URL } from "@portal/auth/editorUrl";
import { useTier } from "@portal/contexts/TierContext";
import { useUI } from "@portal/contexts/UIContext";
import { qk } from "@portal/queries/keys";
import {
  buildProcessorEntityGroups,
  defaultPortalEntityScopes,
  isDocsSearchable,
  withPortalEntityDependencies,
  type ProcessorEntities,
} from "@portal/search/entitySearch";

const EDITOR_GROUP_ORDER: SuperSearchGroupId[] = ["tools"];
const SETTINGS_GROUP_ORDER: SuperSearchGroupId[] = ["settings"];
const PROCESSOR_SECTION_LABEL_KEY = "superSearch.group.processor";
const PROCESSOR_SECTION_LABEL_FALLBACK = "Processor";
const SETTINGS_SECTION_LABEL_KEY = "superSearch.group.settings";
const SETTINGS_SECTION_LABEL_FALLBACK = "Settings";
const EDITOR_SECTION_LABEL_KEY = "portal.nav.editor";
const EDITOR_SECTION_LABEL_FALLBACK = "Editor";

/**
 * Cross-origin editor URL for a tool. Only used when a separately-hosted
 * editor is configured — the same-app case routes client-side instead: on
 * bundled deploys the backend serves the frontend and 401s unauthenticated
 * document GETs (the JWT lives in localStorage, so a full page load carries
 * no credentials), which would bounce every tool hop to /login.
 */
function externalEditorHref(path: string): string {
  return EDITOR_URL.replace(/\/$/, "") + path;
}

/**
 * The portal bar's filter chips — every lane the editor offers except Files
 * (files only open in the editor) and Pages (the sidebar covers navigation).
 * Ordered to match the dropdown's section priority. Lanes whose data source
 * refuses this session (the users roster for non-admins on self-hosted) get
 * no chip — an offered lane must be able to return results.
 */
/** The portal session's visibility gates, shared by its chips and results. */
function usePortalSearchGates(): SuperSearchGates | null {
  const { config } = useAppConfig();
  const accountCardShown = useAccountCardShown();
  const { user } = useAuth();
  return useMemo<SuperSearchGates | null>(
    () =>
      config
        ? {
            isAdmin: config.isAdmin ?? false,
            loginEnabled: config.enableLogin ?? false,
            // Being in the processor is proof of access to it.
            portalAccessible: true,
            showSettingsWhenNoLogin: config.showSettingsWhenNoLogin ?? true,
            accountCardShown,
            isOrgOwner: (config.isAdmin ?? false) && user?.orgOwner === true,
          }
        : null,
    [config, accountCardShown, user],
  );
}

export function usePortalSearchScopes(): SuperSearchScope[] {
  const { t } = useTranslation();
  const gates = usePortalSearchGates();

  return useMemo(
    () => [
      ...PORTAL_ENTITY_SCOPE_DEFS.filter((def) =>
        isPortalEntityScopeOffered(def.id, gates),
      ).map((def) => ({
        id: def.id,
        label: t(def.labelKey, def.labelFallback),
        aliases: [...def.aliases],
      })),
      ...(isDocsSearchable()
        ? [
            {
              id: PORTAL_DOCS_SCOPE_ID,
              label: t("superSearch.group.docs", "Docs"),
              aliases: ["doc", "docs", "documentation"],
            },
          ]
        : []),
      {
        id: "settings",
        label: t("superSearch.group.settings", "Settings"),
        aliases: ["setting", "settings"],
      },
      {
        id: "tools",
        label: t("superSearch.group.tools", "Tools"),
        aliases: ["tool", "tools"],
      },
    ],
    [t, gates],
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
  const gates = usePortalSearchGates();
  const aiEngineEnabled = config ? Boolean(config.aiEngineEnabled) : undefined;
  const { scopeEnabled } = useSearchScopeFilter(options);
  // The chip filter plus the lane's own availability, so an unoffered lane
  // is neither fetched nor shown.
  const entityScopeEnabled = useCallback(
    (scopeId: string) =>
      scopeEnabled(scopeId) && isPortalEntityScopeOffered(scopeId, gates),
    [scopeEnabled, gates],
  );
  const requestedEntityScopes = useMemo(() => {
    if (!active || trimmed.length === 0) return new Set<string>();
    const enabled = defaultPortalEntityScopes(config?.isAdmin ?? false).filter(
      (scopeId) => entityScopeEnabled(scopeId),
    );
    return new Set<string>(withPortalEntityDependencies(enabled));
  }, [active, entityScopeEnabled, trimmed, config?.isAdmin]);

  // Entity data rides the portal's shared query layer — the same keys the
  // views use, so searching warms the view (and vice versa) and the client's
  // staleTime/retry policy replaces bespoke fetch discipline. `enabled` keeps
  // each lane's fetch behind its scope chip and the active-query gate.
  const usersQuery = useQuery({
    queryKey: qk.usersRoster(tier),
    queryFn: () => usersBackend.fetchUsers(tier),
    enabled: requestedEntityScopes.has("portal-users"),
  });
  const policiesListQuery = useQuery({
    queryKey: qk.policiesList(),
    queryFn: fetchPoliciesList,
    enabled: requestedEntityScopes.has("portal-policies"),
  });
  const policyRunsQuery = useQuery({
    queryKey: qk.policyRuns(),
    queryFn: fetchPolicyRuns,
    enabled: requestedEntityScopes.has("portal-policies"),
  });
  const pipelinesQuery = useQuery({
    queryKey: qk.pipelines(),
    queryFn: fetchPipelines,
    enabled: requestedEntityScopes.has("portal-pipelines"),
  });
  const sourcesQuery = useQuery({
    queryKey: qk.sources(),
    queryFn: fetchSources,
    enabled: requestedEntityScopes.has("portal-sources"),
  });

  // Loading only counts for lanes the current search actually requests — a
  // fetch left in flight after its lane was deselected (or the bar closed)
  // must not hold the dropdown's no-results gate open.
  const loadingEntities =
    (requestedEntityScopes.has("portal-users") && usersQuery.isLoading) ||
    (requestedEntityScopes.has("portal-policies") &&
      (policiesListQuery.isLoading || policyRunsQuery.isLoading)) ||
    (requestedEntityScopes.has("portal-pipelines") &&
      pipelinesQuery.isLoading) ||
    (requestedEntityScopes.has("portal-sources") && sourcesQuery.isLoading);

  const entities = useMemo<ProcessorEntities>(
    () => ({
      users: usersQuery.data?.members ?? [],
      policies: policiesListQuery.data
        ? assemblePolicies(policiesListQuery.data, policyRunsQuery.data ?? [])
            .catalogue
        : [],
      pipelines: pipelinesQuery.data?.pipelines ?? [],
      sources: sourcesQuery.data?.sources ?? [],
    }),
    [
      usersQuery.data,
      policiesListQuery.data,
      policyRunsQuery.data,
      pipelinesQuery.data,
      sourcesQuery.data,
    ],
  );

  // The editor's tool list rules, applied without the editor's providers:
  // availability from the same endpoint query, and the user's "hide
  // unavailable tools" choice (else the server default) from storage.
  const toolAvailability = useToolAvailability();
  const baseToolAccess = useToolSearchAccess(toolAvailability);
  const hideUnavailableTools =
    preferencesService.getStoredPreference("hideUnavailableTools") ??
    config?.defaultHideUnavailableTools ??
    false;
  const toolAccess = useCallback(
    (id: ToolId, tool: ToolRegistryEntry): ToolSearchAccess => {
      const access = baseToolAccess(id, tool);
      return hideUnavailableTools && access.kind === "disabled"
        ? { kind: "hidden" }
        : access;
    },
    [baseToolAccess, hideUnavailableTools],
  );

  const openTool = useCallback(
    (id: ToolId, access: ToolSearchAccess) => {
      if (access.kind === "disabled" || access.kind === "hidden") return;
      // Link tools have no in-editor UI — navigating to a tool URL for one
      // lands on a "tool not found" panel. Open their destination directly,
      // matching how the editor's tool lists treat them.
      const tool = allTools[id];
      if (tool?.link) {
        openExternalUrl(tool.link);
        return;
      }
      const path = getToolUrlPath(id);
      if (EDITOR_IS_SAME_APP) {
        // One SPA: swap route-sets through the router. The portal tree
        // unmounts and the editor mounts fresh at the tool URL, so its
        // URL-driven tool init runs exactly as it does on a cold load.
        navigate(path);
      } else {
        assignLocation(externalEditorHref(path));
      }
    },
    [allTools, navigate],
  );

  const openSettingsSection = useCallback(
    (section: string, anchor?: string) => openSettings(section, anchor),
    [openSettings],
  );

  const entityGroups = useMemo<SuperSearchGroup[]>(
    () =>
      buildProcessorEntityGroups(entities, trimmed, t, navigate, {
        scopeEnabled: entityScopeEnabled,
        aiEngineEnabled,
      }),
    [entities, trimmed, t, navigate, entityScopeEnabled, aiEngineEnabled],
  );

  const groups = useMemo(() => {
    // Section order: Processor first, Settings second, Editor last.
    const settingsGroups = assembleSuperSearchGroups(
      {
        settings: scopeEnabled("settings")
          ? rankSettingsResults(trimmed, t, gates, openSettingsSection)
          : [],
      },
      t,
      SETTINGS_GROUP_ORDER,
    ).map((group) => ({
      ...group,
      sectionLabel: t(
        SETTINGS_SECTION_LABEL_KEY,
        SETTINGS_SECTION_LABEL_FALLBACK,
      ),
    }));

    const editorGroups = assembleSuperSearchGroups(
      {
        tools: scopeEnabled("tools")
          ? rankToolResults(allTools, trimmed, openTool, toolAccess)
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
      ...settingsGroups,
      ...editorGroups,
    ];
  }, [
    entityGroups,
    gates,
    openSettingsSection,
    openTool,
    toolAccess,
    scopeEnabled,
    allTools,
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
