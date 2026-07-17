import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@app/auth/UseSession";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { ViewerContext } from "@app/contexts/ViewerContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { fileStorage } from "@app/services/fileStorage";
import {
  rankByFuzzy,
  idToWords,
  FUZZY_MIN_SCORE,
} from "@app/utils/fuzzySearch";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { ToolId } from "@app/types/toolId";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import { SETTINGS_SEARCH_INDEX } from "@app/data/settingsSearchIndex";
import { SETTINGS_SECTION_REGISTRY } from "@app/data/settingsSectionRegistry";
import {
  buildMatchSnippet,
  findSettingsContentMatch,
} from "@app/data/settingsContentSearch";
import {
  PROCESSOR_SEARCH_INDEX,
  type ProcessorSearchEntry,
} from "@app/data/processorSearchIndex";
import { useProcessorEntityGroups } from "@app/data/processorEntitySearch";
import type {
  SuperSearchGates,
  SuperSearchGroup,
  SuperSearchGroupId,
  SuperSearchQueryOptions,
  SuperSearchResult,
  SuperSearchScope,
  UseSuperSearchResult,
} from "@app/types/superSearch";

// Re-exported so existing consumers keep one import site; the definitions
// live in the types leaf (see that module for why).
export type {
  SuperSearchGates,
  SuperSearchGroup,
  SuperSearchGroupId,
  SuperSearchQueryOptions,
  SuperSearchResult,
  SuperSearchScope,
  UseSuperSearchResult,
};

/** Per-group result caps so the dropdown stays scannable. */
const GROUP_LIMIT = 6;
/** A scoped search can show more rows because the dropdown only holds one lane. */
const FOCUSED_GROUP_LIMIT = 8;
/** Group display order in the dropdown. */
const GROUP_ORDER: SuperSearchGroupId[] = [
  "files",
  "tools",
  "settings",
  "processor",
];

/**
 * Shared scope handling for hosts that accept SuperSearchQueryOptions: which
 * source lanes are enabled, and which single lane (if any) is focused — a
 * focused lane can spend a larger row budget since it has the dropdown to
 * itself.
 */
export function useSearchScopeFilter(options?: SuperSearchQueryOptions): {
  scopeEnabled: (scopeId: string) => boolean;
  focusedScopeId: string | null;
} {
  const scopedIds = useMemo(
    () => new Set(options?.scopeIds ?? []),
    [options?.scopeIds],
  );
  const hasScopedSearch = scopedIds.size > 0;
  const scopeEnabled = useCallback(
    (scopeId: string) => !hasScopedSearch || scopedIds.has(scopeId),
    [hasScopedSearch, scopedIds],
  );
  const focusedScopeId =
    scopedIds.size === 1 ? (scopedIds.values().next().value ?? null) : null;
  return { scopeEnabled, focusedScopeId };
}

// ---------------------------------------------------------------------------
// Shared sources. Every host bar (editor workbench, portal shell) builds its
// results from these, so a query ranks identically everywhere — only the
// select actions differ (in-app contexts vs cross-app navigation).
// ---------------------------------------------------------------------------

/** Loads the My Files stubs whenever the search surface is open. */
export function useMyFilesStubs(active: boolean): {
  stubs: StirlingFileStub[];
  loadingFiles: boolean;
} {
  const [stubs, setStubs] = useState<StirlingFileStub[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    // Refresh whenever the surface opens so newly added files appear.
    let cancelled = false;
    if (!loadedOnceRef.current) setLoadingFiles(true);
    fileStorage
      .getLeafStirlingFileStubs()
      .then((all) => {
        if (cancelled) return;
        setStubs(all);
        loadedOnceRef.current = true;
      })
      .catch((err) => {
        console.error("[SuperSearch] Failed to load file stubs:", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return { stubs, loadingFiles };
}

export function rankFileResults(
  stubs: StirlingFileStub[],
  trimmed: string,
  openFile: (stub: StirlingFileStub) => void | Promise<void>,
  limit = GROUP_LIMIT,
): SuperSearchResult[] {
  if (!trimmed) return [];
  return rankByFuzzy(stubs, trimmed, [(s) => s.name])
    .slice(0, limit)
    .map(({ item, score }) => ({
      key: `file:${item.id}`,
      group: "files",
      title: item.name,
      iconName: "insert-drive-file-rounded",
      score,
      onSelect: () => openFile(item),
    }));
}

export function rankToolResults(
  registry: Partial<ToolRegistry>,
  trimmed: string,
  openTool: (id: ToolId) => void,
  limit = GROUP_LIMIT,
): SuperSearchResult[] {
  if (!trimmed) return [];
  const entries = Object.entries(registry) as [
    ToolId,
    ToolRegistry[ToolId] | undefined,
  ][];
  return rankByFuzzy(entries, trimmed, [
    ([id]) => idToWords(id),
    ([, v]) => v?.name ?? "",
    ([, v]) => v?.description ?? "",
    ([, v]) => v?.synonyms?.join(" ") ?? "",
  ])
    .slice(0, limit)
    .map(({ item: [id, tool], score }) => ({
      key: `tool:${id}`,
      group: "tools",
      title: tool?.name ?? id,
      subtitle: tool?.description,
      icon: tool?.icon,
      score,
      onSelect: () => openTool(id),
    }));
}

export function rankSettingsResults(
  trimmed: string,
  t: TFunction,
  gates: SuperSearchGates | null,
  openSettings: (section: string, anchor?: string) => void,
  limit = GROUP_LIMIT,
): SuperSearchResult[] {
  if (!trimmed) return [];

  // Row-level entries (deep-link with ?focus=) take priority.
  const rowMatches = rankByFuzzy(SETTINGS_SEARCH_INDEX, trimmed, [
    (e) => t(e.labelKey, e.labelFallback),
    (e) => e.labelFallback,
    (e) => e.keywords?.join(" ") ?? "",
  ]);
  const rows = rowMatches.map(({ item, score }) => ({
    key: `setting:${item.section}:${item.anchor}`,
    group: "settings",
    title: t(item.labelKey, item.labelFallback),
    subtitle: t(`settings.${item.section}.title`, item.section),
    iconName: "settings-rounded",
    score: score + 1, // nudge rows above bare section matches
    onSelect: () => openSettings(item.section, item.anchor),
  }));

  // Section-level entries (whole tab), gated like the modal nav. The registry
  // resolves per build (core / proprietary / saas / desktop), so this only
  // ever sees sections the current build's settings modal can actually show.
  const visibleSections = SETTINGS_SECTION_REGISTRY.filter((s) => {
    // Null gates (config still loading): hide every gated section.
    if (s.requiresLogin && !(gates?.loginEnabled ?? false)) return false;
    // Admin-area sections mirror the builder's `isAdmin || !loginEnabled` gate.
    if (s.adminArea && !(gates ? gates.isAdmin || !gates.loginEnabled : false))
      return false;
    return true;
  });
  // Result context mirrors the in-modal settings search: the nav group the
  // section lives under, joined to the match snippet with " · ".
  const groupTitle = (s: (typeof SETTINGS_SECTION_REGISTRY)[number]) =>
    s.groupLabelKey
      ? t(s.groupLabelKey, s.groupLabelFallback ?? "")
      : undefined;

  const sectionMatches = rankByFuzzy(visibleSections, trimmed, [
    (s) => t(s.labelKey, s.labelFallback),
    (s) => s.labelFallback,
    (s) => s.keywords?.join(" ") ?? "",
  ]);
  const sections = sectionMatches.map(({ item, score }) => ({
    key: `setting-section:${item.key}`,
    group: "settings",
    title: t(item.labelKey, item.labelFallback),
    subtitle: groupTitle(item),
    iconName: "settings-rounded",
    score,
    onSelect: () => openSettings(item.key),
  }));

  // Content matches: sections whose rendered copy contains the query (the
  // in-modal settings search technique), so terms with no curated keyword
  // ("SMTP", a field label) still find their section. Ranked below every
  // label/keyword match; 3+ chars so a single letter doesn't match half the
  // modal. Sections already surfaced by a label match — their own or one of
  // their rows' — are skipped so the same hit isn't listed twice.
  const labelMatchedKeys = new Set<string>([
    ...sectionMatches.map(({ item }) => item.key),
    ...rowMatches.map(({ item }) => item.section),
  ]);
  const contentMatches =
    trimmed.length < 3
      ? []
      : visibleSections
          .filter((s) => !labelMatchedKeys.has(s.key))
          .flatMap((s) => {
            const match = findSettingsContentMatch(s.key, trimmed, t);
            if (!match) return [];
            const snippet = buildMatchSnippet(match, trimmed);
            const group = groupTitle(s);
            return [
              {
                key: `setting-content:${s.key}`,
                group: "settings",
                title: t(s.labelKey, s.labelFallback),
                subtitle: group ? `${group} · ${snippet}` : snippet,
                iconName: "settings-rounded",
                // Always below the weakest possible label/keyword match.
                score: FUZZY_MIN_SCORE - 10,
                onSelect: () => openSettings(s.key),
              },
            ];
          });

  return [...rows, ...sections, ...contentMatches]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function rankProcessorResults(
  trimmed: string,
  t: TFunction,
  gates: SuperSearchGates | null,
  selectEntry: (entry: ProcessorSearchEntry) => void,
  limit = GROUP_LIMIT,
): SuperSearchResult[] {
  if (!trimmed || PROCESSOR_SEARCH_INDEX.length === 0) return [];
  // Only offer Processor pages to users who can actually enter that app:
  // explicit portal access, admin, or single-user mode with login disabled.
  // Null gates (config still loading) stay closed.
  if (
    !gates ||
    !(gates.portalAccessible === true || gates.isAdmin || !gates.loginEnabled)
  ) {
    return [];
  }
  return rankByFuzzy(PROCESSOR_SEARCH_INDEX, trimmed, [
    (e) => t(e.labelKey, e.labelFallback),
    (e) => e.labelFallback,
    (e) => e.keywords?.join(" ") ?? "",
  ])
    .slice(0, limit)
    .map(({ item, score }) => ({
      key: `processor:${item.id}`,
      group: "processor",
      title: t(item.labelKey, item.labelFallback),
      iconName: "grid-view-rounded",
      score,
      onSelect: () => selectEntry(item),
    }));
}

/**
 * Orders the sources into the shared group layout, dropping empties. Hosts
 * pass their own order so local results lead (the editor puts its own
 * files/tools first and Processor pages last; the portal the reverse).
 */
export function assembleSuperSearchGroups(
  byId: Partial<Record<SuperSearchGroupId, SuperSearchResult[]>>,
  t: TFunction,
  order: SuperSearchGroupId[] = GROUP_ORDER,
): SuperSearchGroup[] {
  const labels: Record<SuperSearchGroupId, string> = {
    files: t("superSearch.group.files", "Files"),
    tools: t("superSearch.group.tools", "Tools"),
    settings: t("superSearch.group.settings", "Settings"),
    processor: t("superSearch.group.processor", "Processor"),
  };
  return order
    .map((id) => ({
      id,
      label: labels[id],
      results: byId[id] ?? [],
    }))
    .filter((g) => g.results.length > 0);
}

/**
 * The editor's results provider: the shared sources wired to in-app select
 * actions (open file → viewer, select tool in the workbench, deep-link into
 * the settings modal, route into the Processor).
 *
 * @param query   current search text
 * @param active  whether the search surface is open; gates the My Files load
 */
export function useSuperSearch(
  query: string,
  active: boolean,
  options?: SuperSearchQueryOptions,
): UseSuperSearchResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authState = useAuth();
  const {
    toolRegistry,
    handleToolSelect,
    handleToolSelectForced,
    toolAvailability,
  } = useToolWorkflow();
  const { actions: navActions } = useNavigationActions();
  const { actions: fileActions } = useFileActions();
  const { config } = useAppConfig();
  // ViewerContext is only present once the viewer subtree mounts; treat as optional.
  const viewer = useContext(ViewerContext);

  const trimmed = query.trim();
  const { stubs, loadingFiles } = useMyFilesStubs(active);
  const { scopeEnabled, focusedScopeId } = useSearchScopeFilter(options);

  const scopeLimit = useCallback(
    (scopeId: SuperSearchGroupId) =>
      focusedScopeId === scopeId ? FOCUSED_GROUP_LIMIT : GROUP_LIMIT,
    [focusedScopeId],
  );

  // --- Actions -----------------------------------------------------------
  const openFile = useCallback(
    async (stub: StirlingFileStub) => {
      try {
        // The file already lives in storage — load it as a stub so its id and
        // metadata are preserved (addFiles would persist a duplicate record).
        await fileActions.addStirlingFileStubs([stub], { selectFiles: true });
        navActions.setWorkbench("viewer");
        viewer?.setActiveFileId?.(stub.id);
      } catch (err) {
        console.error("[SuperSearch] Failed to open file:", stub.name, err);
      }
    },
    [fileActions, navActions, viewer],
  );

  const openTool = useCallback(
    (id: ToolId) => {
      // Link tools have no in-editor UI — selecting one shows a "tool not
      // found" panel. Open their destination directly, matching how the
      // editor's tool lists treat them.
      const link = toolRegistry[id]?.link;
      if (link) {
        window.open(link, "_blank", "noopener,noreferrer");
        return;
      }
      // Tools whose backend endpoint isn't served in this environment are
      // flagged unavailable; handleToolSelect silently no-ops them. For a
      // search ("take me to Repair") we still want the click to open the
      // tool's UI, so fall back to the forced path for those. Available tools
      // keep the normal path so the unsaved-changes guard still applies.
      const available = toolAvailability[id]?.available !== false;
      if (available) {
        handleToolSelect(id);
      } else {
        handleToolSelectForced(id);
      }
    },
    [handleToolSelect, handleToolSelectForced, toolAvailability, toolRegistry],
  );

  const openSettings = useCallback(
    (section: string, anchor?: string) => {
      const path = anchor
        ? `/settings/${section}?focus=${encodeURIComponent(anchor)}`
        : `/settings/${section}`;
      navigate(path);
    },
    [navigate],
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

  // --- Assemble ----------------------------------------------------------
  const gates = useMemo<SuperSearchGates | null>(
    () =>
      config
        ? {
            isAdmin: authState.isAdmin ?? config.isAdmin ?? false,
            loginEnabled: config.enableLogin ?? false,
            portalAccessible: authState.portalAccess ?? false,
          }
        : null,
    [authState.isAdmin, authState.portalAccess, config],
  );

  // Processor entities (users, policies, pipelines, sources) join the pages
  // under the Processor section — same gate as the pages group.
  const processorGateOpen =
    !!gates &&
    (gates.portalAccessible === true || gates.isAdmin || !gates.loginEnabled);
  const entityGroups = useProcessorEntityGroups(
    trimmed,
    active &&
      trimmed.length > 0 &&
      processorGateOpen &&
      scopeEnabled("processor"),
    t,
    navigate,
  );

  const groups = useMemo<SuperSearchGroup[]>(() => {
    const assembledGroups = assembleSuperSearchGroups(
      {
        files: scopeEnabled("files")
          ? rankFileResults(stubs, trimmed, openFile, scopeLimit("files"))
          : [],
        tools: scopeEnabled("tools")
          ? rankToolResults(
              toolRegistry,
              trimmed,
              openTool,
              scopeLimit("tools"),
            )
          : [],
        settings: scopeEnabled("settings")
          ? rankSettingsResults(
              trimmed,
              t,
              gates,
              openSettings,
              scopeLimit("settings"),
            )
          : [],
        processor: scopeEnabled("processor")
          ? rankProcessorResults(
              trimmed,
              t,
              gates,
              selectProcessorEntry,
              scopeLimit("processor"),
            )
          : [],
      },
      t,
    );

    // Section order: Editor first, Settings second, Processor last.
    const processorSection = t("superSearch.group.processor", "Processor");
    const sectionFor = (groupId: string): string => {
      if (groupId === "processor") return processorSection;
      if (groupId === "settings")
        return t("superSearch.group.settings", "Settings");
      return t("portal.nav.editor", "Editor");
    };
    return [
      ...assembledGroups.map((group) => ({
        ...group,
        label:
          group.id === "processor"
            ? t("superSearch.group.pages", "Pages")
            : group.label,
        sectionLabel: sectionFor(group.id),
      })),
      ...entityGroups.map((group) => ({
        ...group,
        sectionLabel: processorSection,
      })),
    ];
  }, [
    stubs,
    trimmed,
    openFile,
    toolRegistry,
    openTool,
    gates,
    openSettings,
    selectProcessorEntry,
    scopeEnabled,
    scopeLimit,
    entityGroups,
    t,
  ]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  return { groups, flatResults, loadingFiles };
}
