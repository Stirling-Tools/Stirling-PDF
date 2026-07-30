import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Button,
  EmptyState,
  Skeleton,
  TableToolbar,
  type TabItem,
} from "@app/ui";
import { useSectionFlags } from "@portal/hooks/useAsync";
import { useSources } from "@portal/queries/sources";
import { SourcesIcon } from "@portal/components/icons";
import { type SourceStatus, type SourceView } from "@portal/api/sources";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { KpiStrip } from "@portal/components/sources/KpiStrip";
import { SourcesTable } from "@portal/components/sources/SourcesTable";
import { SourceModal } from "@portal/components/sources/SourceModal";
import { sourceTypeMeta } from "@portal/components/sources/sourceTypes";
import "@portal/views/Sources.css";

type SourceFilter = "all" | SourceStatus;

const FILTER_STATUSES: SourceStatus[] = ["active", "unused", "disabled"];

export function Sources() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");

  const state = useSources();
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);

  // Create/edit live in a modal on this list; `?new=1` (old /sources/new deep
  // links redirect here with it) opens the create flow on arrival.
  const [modal, setModal] = useState<{
    open: boolean;
    sourceId: string | null;
  }>({ open: false, sourceId: null });

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setModal({ open: true, sourceId: null });
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const sources = data?.sources ?? [];

  // The editor is a virtual row that's always present, so "empty" means no
  // configured sources beyond it. Gates the KPI strip and empty panel.
  const configuredCount = sources.filter((s) => s.type !== "editor").length;
  const showEmpty = !isLoading && configuredCount === 0;

  // Search matches the visible name (the editor row is labelled by its type)
  // and the type label; the chip then narrows by status.
  const visibleSources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (!q) return true;
      const label = s.name || t(sourceTypeMeta(s.type).labelKey);
      return (
        label.toLowerCase().includes(q) ||
        t(sourceTypeMeta(s.type).labelKey).toLowerCase().includes(q)
      );
    });
  }, [sources, filter, search, t]);

  // Only statuses that occur get a chip; All always shows.
  const filterItems: TabItem<SourceFilter>[] = [
    {
      key: "all",
      label: t("portal.sources.filters.all"),
      count: sources.length,
    },
    ...FILTER_STATUSES.map((status) => ({
      key: status as SourceFilter,
      label: t(`portal.sources.status.${status}`),
      count: sources.filter((s) => s.status === status).length,
    })).filter((item) => item.count > 0),
  ];

  const openCreate = () => setModal({ open: true, sourceId: null });
  const openSource = (source: SourceView) =>
    setModal({ open: true, sourceId: source.id });

  // The Connections tab moved to its own Integrations view.
  if (searchParams.get("tab") === "connections") {
    return <Navigate to={toPortalPath(VIEW_PATHS.integrations)} replace />;
  }

  return (
    <div className="portal-sources">
      <header className="portal-sources__head">
        <div>
          <h1 className="portal-sources__title">{t("portal.sources.title")}</h1>
          <p className="portal-sources__sub">{t("portal.sources.subtitle")}</p>
        </div>
        <div className="portal-sources__actions">
          <Button
            onClick={openCreate}
            leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
          >
            {t("portal.sources.actions.connectSource")}
          </Button>
        </div>
      </header>

      {!showEmpty && <KpiStrip data={data} loading={loading} />}

      {isLoading && (
        <div className="portal-sources__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {showEmpty && (
        <EmptyState
          icon={<SourcesIcon size={28} />}
          title={t("portal.sources.empty.title")}
          description={t("portal.sources.empty.description")}
          actions={
            <Button
              onClick={openCreate}
              leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.sources.actions.connectSource")}
            </Button>
          }
        />
      )}

      {!isLoading && sources.length > 0 && (
        <div>
          <TableToolbar<SourceFilter>
            attached
            filters={filterItems}
            activeFilter={filter}
            onFilterChange={setFilter}
            filterAriaLabel={t("portal.sources.filters.ariaLabel")}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("portal.sources.filters.search")}
          />
          <SourcesTable
            sources={visibleSources}
            onRowClick={openSource}
            empty={t("portal.sources.table.noMatch")}
          />
        </div>
      )}

      <SourceModal
        open={modal.open}
        sourceId={modal.sourceId}
        onClose={() => setModal({ open: false, sourceId: null })}
      />
    </div>
  );
}
