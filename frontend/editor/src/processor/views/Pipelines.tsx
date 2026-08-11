import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, EmptyState, Skeleton } from "@app/ui";
import { useSectionFlags } from "@processor/hooks/useAsync";
import { usePipelines } from "@processor/queries/pipelines";
import { type PipelineView } from "@processor/api/pipelines";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import { PipelinesIcon } from "@processor/components/icons";
import { KpiStrip } from "@processor/components/pipelines/KpiStrip";
import { PipelinesTable } from "@processor/components/pipelines/PipelinesTable";
import "@processor/views/Pipelines.css";

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
    navigate(`${toProcessorPath(VIEW_PATHS.pipelines)}/new`);
  const connectSource = () =>
    navigate(`${toProcessorPath(VIEW_PATHS.sources)}/new`);
  // A row opens that pipeline's own page (view / edit / run / delete live there).
  const openPipeline = (pipeline: PipelineView) =>
    navigate(`${toProcessorPath(VIEW_PATHS.pipelines)}/${pipeline.id}`);

  return (
    <div className="processor-pipelines">
      <header className="processor-pipelines__head">
        <div>
          <h1 className="processor-pipelines__title">
            {t("processor.pipelines.title")}
          </h1>
          <p className="processor-pipelines__sub">
            {t("processor.pipelines.subtitle")}
          </p>
        </div>
        <Button
          onClick={openCreate}
          leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("processor.pipelines.actions.newPipeline")}
        </Button>
      </header>

      {hasPipelines && <KpiStrip data={data} loading={loading} />}

      {isLoading && (
        <div className="processor-pipelines__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {showEmpty && (
        <EmptyState
          icon={<PipelinesIcon size={28} />}
          title={t("processor.pipelines.empty.title")}
          description={t("processor.pipelines.empty.description")}
          actions={
            <>
              <Button
                onClick={openCreate}
                leftSection={
                  <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("processor.pipelines.empty.action")}
              </Button>
              <Button variant="secondary" onClick={connectSource}>
                {t("processor.pipelines.empty.connectSource")}
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
