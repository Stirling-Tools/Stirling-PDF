import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { ViewerContext } from "@app/contexts/ViewerContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { fileStorage } from "@app/services/fileStorage";
import { rankByFuzzy, idToWords } from "@app/utils/fuzzySearch";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { ToolId } from "@app/types/toolId";
import {
  SETTINGS_SEARCH_INDEX,
  SETTINGS_SECTIONS,
} from "@app/data/settingsSearchIndex";

export type SuperSearchGroupId = "files" | "tools" | "settings";

export interface SuperSearchResult {
  /** Stable unique key across all groups. */
  key: string;
  group: SuperSearchGroupId;
  title: string;
  subtitle?: string;
  /** LocalIcon name (files/settings); tools provide a React node via `icon`. */
  iconName?: string;
  icon?: React.ReactNode;
  score: number;
  onSelect: () => void | Promise<void>;
}

export interface SuperSearchGroup {
  id: SuperSearchGroupId;
  label: string;
  results: SuperSearchResult[];
}

/** Per-group result caps so the dropdown stays scannable. */
const GROUP_LIMIT = 6;
/** Group display order in the dropdown. */
const GROUP_ORDER: SuperSearchGroupId[] = ["files", "tools", "settings"];

export interface UseSuperSearchResult {
  /** Non-empty groups, in display order. */
  groups: SuperSearchGroup[];
  /** All results flattened in display order (for keyboard navigation). */
  flatResults: SuperSearchResult[];
  /** True while the My Files store is loading for the first time. */
  loadingFiles: boolean;
}

/**
 * Aggregates the three super-search providers — My Files, Tools, and Settings —
 * into a single ranked, grouped result set, and wires each result's select
 * action (open file → viewer, select tool, deep-link into settings).
 *
 * @param query   current search text
 * @param active  whether the search surface is open; gates the My Files load
 */
export function useSuperSearch(
  query: string,
  active: boolean,
): UseSuperSearchResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toolRegistry, handleToolSelect, handleToolSelectForced, toolAvailability } =
    useToolWorkflow();
  const { actions: navActions } = useNavigationActions();
  const { addFiles } = useFileHandler();
  const { config } = useAppConfig();
  // ViewerContext is only present once the viewer subtree mounts; treat as optional.
  const viewer = useContext(ViewerContext);

  const trimmed = query.trim();

  // --- My Files store ----------------------------------------------------
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

  // --- Actions -----------------------------------------------------------
  const openFile = useCallback(
    async (stub: StirlingFileStub) => {
      try {
        const file = await fileStorage.getStirlingFile(stub.id);
        if (!file) return;
        await addFiles([file], { selectFiles: true });
        navActions.setWorkbench("viewer");
        viewer?.setActiveFileId?.(stub.id);
      } catch (err) {
        console.error("[SuperSearch] Failed to open file:", stub.name, err);
      }
    },
    [addFiles, navActions, viewer],
  );

  const openTool = useCallback(
    (id: ToolId) => {
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
    [handleToolSelect, handleToolSelectForced, toolAvailability],
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

  // --- Files results -----------------------------------------------------
  const fileResults = useMemo<SuperSearchResult[]>(() => {
    if (!trimmed) return [];
    return rankByFuzzy(stubs, trimmed, [(s) => s.name])
      .slice(0, GROUP_LIMIT)
      .map(({ item, score }) => ({
        key: `file:${item.id}`,
        group: "files" as const,
        title: item.name,
        iconName: "insert-drive-file-rounded",
        score,
        onSelect: () => openFile(item),
      }));
  }, [trimmed, stubs, openFile]);

  // --- Tools results -----------------------------------------------------
  const toolResults = useMemo<SuperSearchResult[]>(() => {
    if (!trimmed) return [];
    const entries = Object.entries(toolRegistry) as [
      ToolId,
      (typeof toolRegistry)[ToolId],
    ][];
    return rankByFuzzy(entries, trimmed, [
      ([id]) => idToWords(id),
      ([, v]) => v?.name ?? "",
      ([, v]) => v?.description ?? "",
      ([, v]) => v?.synonyms?.join(" ") ?? "",
    ])
      .slice(0, GROUP_LIMIT)
      .map(({ item: [id, tool], score }) => ({
        key: `tool:${id}`,
        group: "tools" as const,
        title: tool?.name ?? id,
        subtitle: tool?.description,
        icon: tool?.icon,
        score,
        onSelect: () => openTool(id),
      }));
  }, [trimmed, toolRegistry, openTool]);

  // --- Settings results --------------------------------------------------
  const settingsResults = useMemo<SuperSearchResult[]>(() => {
    if (!trimmed) return [];
    const isAdmin = config?.isAdmin ?? false;
    const loginEnabled = config?.enableLogin ?? false;

    // Row-level entries (deep-link with ?focus=) take priority.
    const rows = rankByFuzzy(SETTINGS_SEARCH_INDEX, trimmed, [
      (e) => t(e.labelKey, e.labelFallback),
      (e) => e.labelFallback,
      (e) => e.keywords?.join(" ") ?? "",
    ]).map(({ item, score }) => ({
      key: `setting:${item.section}:${item.anchor}`,
      group: "settings" as const,
      title: t(item.labelKey, item.labelFallback),
      subtitle: t(`settings.${item.section}.title`, item.section),
      iconName: "settings-rounded",
      score: score + 1, // nudge rows above bare section matches
      onSelect: () => openSettings(item.section, item.anchor),
    }));

    // Section-level entries (whole tab), gated like the modal nav.
    const visibleSections = SETTINGS_SECTIONS.filter((s) => {
      if (s.adminOnly && !isAdmin) return false;
      if (s.requiresLogin && !loginEnabled) return false;
      return true;
    });
    const sections = rankByFuzzy(visibleSections, trimmed, [
      (s) => t(s.labelKey, s.labelFallback),
      (s) => s.labelFallback,
      (s) => s.keywords?.join(" ") ?? "",
    ]).map(({ item, score }) => ({
      key: `setting-section:${item.key}`,
      group: "settings" as const,
      title: t(item.labelKey, item.labelFallback),
      iconName: "settings-rounded",
      score,
      onSelect: () => openSettings(item.key),
    }));

    return [...rows, ...sections]
      .sort((a, b) => b.score - a.score)
      .slice(0, GROUP_LIMIT);
  }, [trimmed, config, t, openSettings]);

  // --- Assemble ----------------------------------------------------------
  const groups = useMemo<SuperSearchGroup[]>(() => {
    const byId: Record<SuperSearchGroupId, SuperSearchResult[]> = {
      files: fileResults,
      tools: toolResults,
      settings: settingsResults,
    };
    const labels: Record<SuperSearchGroupId, string> = {
      files: t("superSearch.group.files", "Files"),
      tools: t("superSearch.group.tools", "Tools"),
      settings: t("superSearch.group.settings", "Settings"),
    };
    return GROUP_ORDER.map((id) => ({
      id,
      label: labels[id],
      results: byId[id],
    })).filter((g) => g.results.length > 0);
  }, [fileResults, toolResults, settingsResults, t]);

  const flatResults = useMemo(
    () => groups.flatMap((g) => g.results),
    [groups],
  );

  return { groups, flatResults, loadingFiles };
}
