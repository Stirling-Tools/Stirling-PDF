import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { withBasePath } from "@app/constants/app";
import { getToolUrlPath } from "@app/data/toolsTaxonomy";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { rankByFuzzy } from "@app/utils/fuzzySearch";
import type { ToolId } from "@app/types/toolId";
import type { ProcessorSearchEntry } from "@app/data/processorSearchIndex";
import {
  assembleSuperSearchGroups,
  rankProcessorResults,
  rankSettingsResults,
  rankToolResults,
  type SuperSearchGates,
  type SuperSearchGroup,
  type SuperSearchGroupId,
  type UseSuperSearchResult,
} from "@app/hooks/useSuperSearch";
import { useUI } from "@portal/contexts/UIContext";
import { useTier } from "@portal/contexts/TierContext";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { EDITOR_IS_SAME_APP, EDITOR_URL } from "@portal/auth/editorUrl";
import { fetchUsers, type Member } from "@portal/api/users";
import { fetchPolicies, type CatalogueEntry } from "@portal/api/policies";
import { fetchPipelines, type PipelineView } from "@portal/api/pipelines";
import { fetchSources, type SourceView } from "@portal/api/sources";
import {
  UsersIcon,
  PoliciesIcon,
  PipelinesIcon,
  SourcesIcon,
} from "@portal/components/icons";

/** Processor pages lead in the portal; the editor bar orders its own first. */
const PORTAL_GROUP_ORDER: SuperSearchGroupId[] = [
  "processor",
  "tools",
  "settings",
];

/** Entity groups cap lower than the shared GROUP_LIMIT — with up to seven
 * groups in the portal dropdown, six rows each stops being scannable. */
const ENTITY_GROUP_LIMIT = 4;

/**
 * Tool results live in the editor app, so selecting one is a full page load
 * there (the editor initialises its tool state from the URL on boot —
 * client-side routing can't reach that init once mounted).
 */
function editorHref(path: string): string {
  if (EDITOR_IS_SAME_APP) return withBasePath(path);
  return EDITOR_URL.replace(/\/$/, "") + path;
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

/**
 * Loads the portal's searchable entities whenever the search surface opens,
 * then ranking happens client-side per keystroke. allSettled so one failing
 * endpoint (e.g. policies on a backend without them) doesn't drop the rest.
 */
function usePortalEntities(active: boolean): PortalEntities {
  const { tier } = useTier();
  const [entities, setEntities] = useState<PortalEntities>(NO_ENTITIES);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.allSettled([
      fetchUsers(tier),
      fetchPolicies(),
      fetchPipelines(),
      fetchSources(),
    ]).then(([users, policies, pipelines, sources]) => {
      if (cancelled) return;
      setEntities({
        users: users.status === "fulfilled" ? users.value.members : [],
        policies:
          policies.status === "fulfilled" ? policies.value.catalogue : [],
        pipelines:
          pipelines.status === "fulfilled" ? pipelines.value.pipelines : [],
        sources: sources.status === "fulfilled" ? sources.value.sources : [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [active, tier]);

  return entities;
}

/**
 * The portal's results provider for the shared super search bar: the same
 * sources the editor bar ranks minus files (a file only opens inside the
 * editor), with Processor pages leading and the portal's own entities —
 * users, policies, pipelines, sources — ranked between the pages and the
 * shared groups. Tools hand over to the editor, settings opens the portal's
 * settings modal, everything else navigates in-app.
 */
export function usePortalSearchResults(
  query: string,
  active: boolean,
): UseSuperSearchResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openSettings } = useUI();
  const { allTools } = useToolRegistry();
  const { config } = useAppConfig();

  const trimmed = query.trim();
  const entities = usePortalEntities(active);

  const openTool = useCallback((id: ToolId) => {
    window.location.assign(editorHref(getToolUrlPath(id)));
  }, []);

  const openSettingsSection = useCallback(
    (section: string) => openSettings(section),
    [openSettings],
  );

  const selectProcessorEntry = useCallback(
    (item: ProcessorSearchEntry) => {
      if (item.externalUrl) {
        window.open(item.externalUrl, "_blank", "noopener,noreferrer");
      } else {
        navigate(item.path);
      }
    },
    [navigate],
  );

  const gates = useMemo<SuperSearchGates>(
    () => ({
      isAdmin: config?.isAdmin ?? false,
      loginEnabled: config?.enableLogin ?? false,
    }),
    [config],
  );

  const entityGroups = useMemo<SuperSearchGroup[]>(() => {
    if (!trimmed) return [];
    const groups: SuperSearchGroup[] = [];

    const users = rankByFuzzy(entities.users, trimmed, [
      (m) => m.name,
      (m) => m.email,
    ])
      .slice(0, ENTITY_GROUP_LIMIT)
      .map(({ item, score }) => ({
        key: `portal-user:${item.id}`,
        group: "portal-users",
        title: item.name,
        subtitle: item.email,
        icon: <UsersIcon />,
        score,
        onSelect: () => navigate(toPortalPath(VIEW_PATHS.users)),
      }));
    if (users.length > 0) {
      groups.push({
        id: "portal-users",
        label: t("portal.nav.users"),
        results: users,
      });
    }

    const policies = rankByFuzzy(
      entities.policies.filter((e) => !e.category.comingSoon),
      trimmed,
      [(e) => e.category.label, (e) => e.category.desc],
    )
      .slice(0, ENTITY_GROUP_LIMIT)
      .map(({ item, score }) => ({
        key: `portal-policy:${item.category.id}`,
        group: "portal-policies",
        title: item.category.label,
        subtitle: item.category.desc,
        icon: <PoliciesIcon />,
        score,
        onSelect: () => navigate(toPortalPath(VIEW_PATHS.policies)),
      }));
    if (policies.length > 0) {
      groups.push({
        id: "portal-policies",
        label: t("portal.nav.policies"),
        results: policies,
      });
    }

    const pipelines = rankByFuzzy(entities.pipelines, trimmed, [
      (p) => p.name,
      (p) => p.trigger,
    ])
      .slice(0, ENTITY_GROUP_LIMIT)
      .map(({ item, score }) => ({
        key: `portal-pipeline:${item.id}`,
        group: "portal-pipelines",
        title: item.name,
        subtitle: item.trigger,
        icon: <PipelinesIcon />,
        score,
        onSelect: () =>
          navigate(`${toPortalPath(VIEW_PATHS.pipelines)}/${item.id}`),
      }));
    if (pipelines.length > 0) {
      groups.push({
        id: "portal-pipelines",
        label: t("portal.nav.pipelines"),
        results: pipelines,
      });
    }

    const sources = rankByFuzzy(entities.sources, trimmed, [
      (s) => s.name,
      (s) => s.type,
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
      }));
    if (sources.length > 0) {
      groups.push({
        id: "portal-sources",
        label: t("portal.nav.sources"),
        results: sources,
      });
    }

    return groups;
  }, [entities, trimmed, t, navigate]);

  const groups = useMemo(() => {
    const shared = assembleSuperSearchGroups(
      {
        tools: rankToolResults(allTools, trimmed, openTool),
        settings: rankSettingsResults(trimmed, t, gates, openSettingsSection),
        processor: rankProcessorResults(
          trimmed,
          t,
          gates,
          selectProcessorEntry,
        ),
      },
      t,
      PORTAL_GROUP_ORDER,
    );
    // Entities slot in right after the Processor pages (index -1 + 1 = 0
    // puts them first when no page matched).
    const out = [...shared];
    out.splice(
      out.findIndex((g) => g.id === "processor") + 1,
      0,
      ...entityGroups,
    );
    return out;
  }, [
    trimmed,
    allTools,
    openTool,
    gates,
    openSettingsSection,
    selectProcessorEntry,
    entityGroups,
    t,
  ]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  return { groups, flatResults, loadingFiles: false };
}
