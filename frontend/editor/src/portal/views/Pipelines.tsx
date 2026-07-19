import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Button,
  EmptyState,
  Skeleton,
  TableToolbar,
  type TabItem,
} from "@app/ui";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchPipelines,
  type PipelinesOverviewResponse,
  type PipelineStatus,
  type PipelineView,
} from "@portal/api/pipelines";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { PipelinesIcon } from "@portal/components/icons";
import { KpiStrip } from "@portal/components/pipelines/KpiStrip";
import { PipelinesTable } from "@portal/components/pipelines/PipelinesTable";
import "@portal/views/Pipelines.css";

type PipelineFilter = "all" | PipelineStatus;

const FILTER_STATUSES: PipelineStatus[] = ["active", "paused"];

export function Pipelines() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useAsync<PipelinesOverviewResponse>(() => fetchPipelines(), []);
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [search, setSearch] = useState("");

  const pipelines = data?.pipelines ?? [];
  // Empty once the fetch settles with no pipelines (or fails → no data); gates
  // the empty panel below.
  const showEmpty = !isLoading && pipelines.length === 0;
  // The facts strip reads counters over real pipelines: show it only once some
  // exist, so the loading and empty states don't flash placeholder facts.
  const hasPipelines = pipelines.length > 0;

  // Search matches name, trigger, step operations, and source names; the chip
  // then narrows by status.
  const visiblePipelines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pipelines.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.trigger.toLowerCase().includes(q) ||
        p.steps.some((s) => s.toLowerCase().includes(q)) ||
        p.sources.some((s) => s.name.toLowerCase().includes(q))
      );
    });
  }, [pipelines, filter, search]);

  // Only statuses that occur get a chip; All always shows.
  const filterItems: TabItem<PipelineFilter>[] = [
    {
      key: "all",
      label: t("portal.pipelines.filters.all"),
      count: pipelines.length,
    },
    ...FILTER_STATUSES.map((status) => ({
      key: status as PipelineFilter,
      label: t(`portal.pipelines.status.${status}`),
      count: pipelines.filter((p) => p.status === status).length,
    })).filter((item) => item.count > 0),
  ];

  const openCreate = () =>
    navigate(`${toPortalPath(VIEW_PATHS.pipelines)}/new`);
  const connectSource = () =>
    navigate(`${toPortalPath(VIEW_PATHS.sources)}/new`);
  // A row opens that pipeline's own page (view / edit / run / delete live there).
  const openPipeline = (pipeline: PipelineView) =>
    navigate(`${toPortalPath(VIEW_PATHS.pipelines)}/${pipeline.id}`);

  return (
    <div className="portal-pipelines">
      <header className="portal-pipelines__head">
        <div>
          <h1 className="portal-pipelines__title">
            {t("portal.pipelines.title")}
          </h1>
          <p className="portal-pipelines__sub">
            {t("portal.pipelines.subtitle")}
          </p>
        </div>
        <Button
          onClick={openCreate}
          leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("portal.pipelines.actions.newPipeline")}
        </Button>
      </header>

      {hasPipelines && <KpiStrip data={data} loading={loading} />}

      {isLoading && (
        <div className="portal-pipelines__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {showEmpty && (
        <EmptyState
          icon={<PipelinesIcon size={28} />}
          title={t("portal.pipelines.empty.title")}
          description={t("portal.pipelines.empty.description")}
          actions={
            <>
              <Button
                onClick={openCreate}
                leftSection={
                  <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("portal.pipelines.empty.action")}
              </Button>
              <Button variant="secondary" onClick={connectSource}>
                {t("portal.pipelines.empty.connectSource")}
              </Button>
            </>
          }
        />
      )}

      {!isLoading && hasPipelines && (
        <div>
          <TableToolbar<PipelineFilter>
            attached
            filters={filterItems}
            activeFilter={filter}
            onFilterChange={setFilter}
            filterAriaLabel={t("portal.pipelines.filters.ariaLabel")}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("portal.pipelines.filters.search")}
          />
          <PipelinesTable
            pipelines={visiblePipelines}
            onRowClick={openPipeline}
            empty={t("portal.pipelines.table.noMatch")}
          />
        </div>
      )}
    </div>
  );
}
