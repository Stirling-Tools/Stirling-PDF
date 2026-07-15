import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { rankByFuzzy } from "@app/utils/fuzzySearch";
import type { UseSuperSearchResult } from "@app/hooks/useSuperSearch";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import {
  GROUP_PRIMARY,
  GROUP_OPERATIONAL,
  GROUP_PLATFORM,
  type NavEntry,
} from "@portal/components/sidebarGroups";

/**
 * The portal's results provider for the shared SuperSearch bar: the sidebar's
 * flavor-aware destinations plus the editor app. The editor's provider is the
 * files/tools/settings/Processor aggregate; this is its portal counterpart.
 */
export function usePortalSearchResults(
  query: string,
  _active: boolean,
): UseSuperSearchResult {
  const { t } = useTranslation();
  const { setActiveView } = useView();

  const entries = useMemo<NavEntry[]>(
    () => [
      ...GROUP_PRIMARY,
      ...GROUP_OPERATIONAL,
      ...GROUP_PLATFORM,
      { id: "editor" as ViewId, icon: null },
    ],
    [],
  );

  const groups = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const results = rankByFuzzy(entries, q, [
      (e) => t(`portal.nav.${e.id}`),
      (e) => e.id,
    ]).map(({ item, score }) => ({
      key: `nav:${item.id}`,
      group: "nav",
      title: t(`portal.nav.${item.id}`),
      icon: item.icon ?? undefined,
      iconName: item.icon ? undefined : "search-rounded",
      score,
      onSelect: () => {
        if (item.externalUrl) {
          window.open(item.externalUrl, "_blank", "noopener,noreferrer");
          return;
        }
        setActiveView(item.id);
      },
    }));
    return results.length > 0
      ? [{ id: "nav", label: t("portal.search.goTo", "Go to"), results }]
      : [];
  }, [entries, query, t, setActiveView]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  return { groups, flatResults, loadingFiles: false };
}
