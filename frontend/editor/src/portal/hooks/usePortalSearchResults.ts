import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { withBasePath } from "@app/constants/app";
import { getToolUrlPath } from "@app/data/toolsTaxonomy";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { ToolId } from "@app/types/toolId";
import type { ProcessorSearchEntry } from "@app/data/processorSearchIndex";
import {
  assembleSuperSearchGroups,
  rankProcessorResults,
  rankSettingsResults,
  rankToolResults,
  type SuperSearchGates,
  type SuperSearchGroupId,
  type UseSuperSearchResult,
} from "@app/hooks/useSuperSearch";
import { useUI } from "@portal/contexts/UIContext";
import { EDITOR_IS_SAME_APP, EDITOR_URL } from "@portal/auth/editorUrl";

/** Processor pages lead in the portal; the editor bar orders its own first. */
const PORTAL_GROUP_ORDER: SuperSearchGroupId[] = [
  "processor",
  "tools",
  "settings",
];

/**
 * Tool results live in the editor app, so selecting one is a full page load
 * there (the editor initialises its tool state from the URL on boot —
 * client-side routing can't reach that init once mounted).
 */
function editorHref(path: string): string {
  if (EDITOR_IS_SAME_APP) return withBasePath(path);
  return EDITOR_URL.replace(/\/$/, "") + path;
}

/**
 * The portal's results provider for the shared super search bar: the same
 * sources the editor bar ranks minus files (a file only opens inside the
 * editor), with Processor pages leading. Only the select actions differ —
 * tools hand over to the editor, settings opens the portal's settings modal,
 * Processor pages navigate in-app.
 */
export function usePortalSearchResults(
  query: string,
  _active: boolean,
): UseSuperSearchResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openSettings } = useUI();
  const { allTools } = useToolRegistry();
  const { config } = useAppConfig();

  const trimmed = query.trim();

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

  const groups = useMemo(
    () =>
      assembleSuperSearchGroups(
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
      ),
    [
      trimmed,
      allTools,
      openTool,
      gates,
      openSettingsSection,
      selectProcessorEntry,
      t,
    ],
  );

  const flatResults = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  return { groups, flatResults, loadingFiles: false };
}
