import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { type TFunction } from "i18next";
import { Button, ToggleSwitch } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
import {
  fetchCreditPromptPipelines,
  setCreditPromptPipelineEnabled,
  type CreditPromptPipeline,
} from "@app/services/creditPromptPipelines";
import { pipelineQueryKeys } from "@app/policies/queryKeys";

const VISIBLE_PIPELINES = 5;

type PipelineError = "load" | "save" | null;

interface Props {
  onManagePipeline?: (id?: string) => void;
  affectedPipelineId?: string;
}

/** Secondary controls for optional automation; opening the disclosure never changes a pipeline. */
export function CreditPromptPipelines({
  onManagePipeline,
  affectedPipelineId,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pipelines, setPipelines] = useState<CreditPromptPipeline[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<PipelineError>(null);
  useEffect(() => {
    let active = true;
    fetchCreditPromptPipelines()
      .then((result) => {
        if (!active) return;
        setPipelines(
          [...result.pipelines].sort(
            (a, b) =>
              Number(b.id === affectedPipelineId) -
              Number(a.id === affectedPipelineId),
          ),
        );
        setCanManage(result.canManage);
      })
      .catch(() => {
        if (active) setError("load");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [affectedPipelineId]);

  async function changeEnabled(
    pipeline: CreditPromptPipeline,
    enabled: boolean,
  ) {
    setBusy(pipeline.id);
    setError(null);
    try {
      await setCreditPromptPipelineEnabled(pipeline.id, enabled);
      setPipelines((rows) =>
        rows.map((row) => (row.id === pipeline.id ? { ...row, enabled } : row)),
      );
      void queryClient.invalidateQueries({
        queryKey: pipelineQueryKeys.pipelines(),
      });
      void queryClient.invalidateQueries({
        queryKey: pipelineQueryKeys.policiesList(),
      });
    } catch {
      setError("save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="portal-connect__pipelines">
      <div className="portal-connect__pipeline-header">
        <button
          type="button"
          className="portal-connect__pipeline-disclosure"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
          <span>
            {t("portal.accountLink.pipelines.title", "Active pipelines")}
          </span>
          <EnabledCount
            loaded={!loading && error !== "load"}
            pipelines={pipelines}
          />
        </button>
        <ManagePipelinesButton
          pipelines={pipelines}
          affectedPipelineId={affectedPipelineId}
          onManagePipeline={onManagePipeline}
        />
      </div>
      <PipelineChoices
        expanded={expanded}
        id={listId}
        loading={loading}
        error={error}
        pipelines={pipelines}
        affectedPipelineId={affectedPipelineId}
        togglesDisabled={!canManage || busy !== null}
        onChangeEnabled={changeEnabled}
      />
    </section>
  );
}

function EnabledCount({
  loaded,
  pipelines,
}: {
  loaded: boolean;
  pipelines: CreditPromptPipeline[];
}) {
  if (!loaded) return null;
  return (
    <span className="portal-connect__pipeline-count">
      {" "}
      {pipelines.filter((pipeline) => pipeline.enabled).length}
    </span>
  );
}

function ManagePipelinesButton({
  pipelines,
  affectedPipelineId,
  onManagePipeline,
}: {
  pipelines: CreditPromptPipeline[];
  affectedPipelineId?: string;
  onManagePipeline?: (id?: string) => void;
}) {
  const { t } = useTranslation();
  if (!onManagePipeline) return null;
  const showsAll = pipelines.length > VISIBLE_PIPELINES;
  return (
    <Button
      size="sm"
      px="none"
      variant="quiet"
      accent="neutral"
      onClick={() =>
        onManagePipeline(showsAll ? undefined : affectedPipelineId)
      }
    >
      {showsAll
        ? t("portal.accountLink.pipelines.viewAll", "View all pipelines")
        : t("portal.accountLink.failure.manage", "Open pipeline settings")}
    </Button>
  );
}

interface PipelineListProps {
  loading: boolean;
  error: PipelineError;
  pipelines: CreditPromptPipeline[];
  affectedPipelineId?: string;
  togglesDisabled: boolean;
  onChangeEnabled: (
    pipeline: CreditPromptPipeline,
    enabled: boolean,
  ) => Promise<void>;
}

interface PipelineChoicesProps extends PipelineListProps {
  expanded: boolean;
  id: string;
}

function PipelineChoices({ expanded, id, ...list }: PipelineChoicesProps) {
  if (!expanded) return null;
  return (
    <div id={id} className="portal-connect__pipeline-choices">
      <PipelineList {...list} />
      <PipelineErrorMessage error={list.error} />
    </div>
  );
}

function PipelineList({
  loading,
  error,
  pipelines,
  affectedPipelineId,
  togglesDisabled,
  onChangeEnabled,
}: PipelineListProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <p className="portal-connect__lede">
        {t("portal.accountLink.pipelines.loading", "Loading pipelines…")}
      </p>
    );
  }
  return (
    <>
      <NoPipelinesNote show={!error && pipelines.length === 0} />
      <ul className="portal-connect__pipeline-list">
        {pipelines.slice(0, VISIBLE_PIPELINES).map((pipeline) => (
          <PipelineRow
            key={pipeline.id}
            pipeline={pipeline}
            triggered={pipeline.id === affectedPipelineId}
            toggleDisabled={togglesDisabled || pipeline.required}
            onToggle={(enabled) => void onChangeEnabled(pipeline, enabled)}
          />
        ))}
      </ul>
    </>
  );
}

function NoPipelinesNote({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <p className="portal-connect__lede">
      {t("portal.accountLink.pipelines.empty", "No active pipelines.")}
    </p>
  );
}

interface PipelineRowProps {
  pipeline: CreditPromptPipeline;
  triggered: boolean;
  toggleDisabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function PipelineRow({
  pipeline,
  triggered,
  toggleDisabled,
  onToggle,
}: PipelineRowProps) {
  const { t } = useTranslation();
  return (
    <li>
      <div className="portal-connect__pipeline-details">
        <span className="portal-connect__row-label">
          {pipeline.name}
          <TriggeredInfo triggered={triggered} />
        </span>
        <span className="portal-connect__pipeline-source">
          {sourceLabel(t, pipeline)}
          <PipelineNotes pipeline={pipeline} />
        </span>
      </div>
      <ToggleSwitch
        aria-label={pipeline.name}
        checked={pipeline.enabled}
        disabled={toggleDisabled}
        onChange={onToggle}
      />
    </li>
  );
}

function TriggeredInfo({ triggered }: { triggered: boolean }) {
  const { t } = useTranslation();
  if (!triggered) return null;
  const label = t(
    "portal.accountLink.pipelines.triggered",
    "Triggered this prompt",
  );
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className="portal-connect__trigger-info"
        aria-label={label}
      >
        <Icon name="info" size={14} />
      </button>
    </Tooltip>
  );
}

function PipelineNotes({ pipeline }: { pipeline: CreditPromptPipeline }) {
  const { t } = useTranslation();
  const notes = [
    {
      key: "required",
      shown: pipeline.required,
      text: t(
        "portal.accountLink.pipelines.required",
        "Required policy · manage in pipeline settings",
      ),
    },
    {
      key: "paused",
      shown: !pipeline.enabled,
      text: t("portal.accountLink.pipelines.paused", "Paused"),
    },
  ].filter((note) => note.shown);
  return (
    <>
      {notes.map((note) => (
        <span key={note.key} className="portal-connect__pipeline-note">
          {note.text}
        </span>
      ))}
    </>
  );
}

function PipelineErrorMessage({ error }: { error: PipelineError }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <p role="alert" className="portal-connect__lede">
      {error === "load"
        ? t(
            "portal.accountLink.pipelines.loadFailed",
            "Could not load pipelines. Open pipeline settings to try again.",
          )
        : t(
            "portal.accountLink.pipelines.saveFailed",
            "Could not change this pipeline. Open pipeline settings to review it.",
          )}
    </p>
  );
}

function sourceLabel(t: TFunction, pipeline: CreditPromptPipeline) {
  const labels = pipeline.sources.map((source) => source.name);
  if (pipeline.editor?.allowed || pipeline.trigger.startsWith("editor-")) {
    labels.unshift(
      pipeline.editor?.runOn === "export" ||
        pipeline.trigger === "editor-export"
        ? t(
            "portal.accountLink.pipelines.editorExport",
            "Editor · before download",
          )
        : t("portal.accountLink.pipelines.editorUpload", "Editor · on upload"),
    );
  }
  return (
    labels.join(", ") || t("portal.accountLink.pipelines.manual", "Manual runs")
  );
}
