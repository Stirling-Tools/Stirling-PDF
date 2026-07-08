import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, EmptyState, Skeleton } from "@app/ui";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchPipelines,
  type PipelinesOverviewResponse,
  type PipelineView,
} from "@portal/api/pipelines";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { KpiStrip } from "@portal/components/pipelines/KpiStrip";
import { PipelinesTable } from "@portal/components/pipelines/PipelinesTable";
import "@portal/views/Pipelines.css";

export function Pipelines() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useAsync<PipelinesOverviewResponse>(() => fetchPipelines(), []);
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const pipelines = data?.pipelines ?? [];

  const openCreate = () =>
    navigate(`${toPortalPath(VIEW_PATHS.pipelines)}/new`);
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

      <KpiStrip data={data} loading={loading} />

      {isLoading && (
        <div className="portal-pipelines__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("portal.pipelines.empty.title")}
          description={t("portal.pipelines.empty.description")}
          actions={
            <Button onClick={openCreate}>
              {t("portal.pipelines.empty.action")}
            </Button>
          }
        />
      )}

      {!isLoading && !isEmpty && pipelines.length > 0 && (
        <PipelinesTable pipelines={pipelines} onRowClick={openPipeline} />
      )}
    </div>
  );
}
