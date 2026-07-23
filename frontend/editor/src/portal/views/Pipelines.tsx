import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, EmptyState, Skeleton } from "@app/ui";
import { useSectionFlags } from "@portal/hooks/useAsync";
import { usePipelines } from "@portal/queries/pipelines";
import { type PipelineView } from "@portal/api/pipelines";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { PipelinesIcon } from "@portal/components/icons";
import { KpiStrip } from "@portal/components/pipelines/KpiStrip";
import { PipelinesTable } from "@portal/components/pipelines/PipelinesTable";
import "@portal/views/Pipelines.css";

export function Pipelines() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = usePipelines();
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);

  const pipelines = data?.pipelines ?? [];
  // Empty once the fetch settles with no pipelines (or fails → no data); gates
  // the empty panel below.
  const showEmpty = !isLoading && pipelines.length === 0;
  // The KPI strip is pure stat boxes: show it only once real pipelines exist, so
  // the loading and empty states don't flash a row of placeholder cards.
  const hasPipelines = pipelines.length > 0;

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

      {!isLoading && pipelines.length > 0 && (
        <PipelinesTable pipelines={pipelines} onRowClick={openPipeline} />
      )}
    </div>
  );
}
