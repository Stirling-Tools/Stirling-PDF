import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import InputOutlinedIcon from "@mui/icons-material/InputOutlined";
import OutputOutlinedIcon from "@mui/icons-material/OutputOutlined";
import { useAuth } from "@app/auth/context";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { saveEditorReturnPath } from "@app/services/workbenchSession";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import {
  useEditorPipelines,
  type EditorPipeline,
  type EditorPipelines,
} from "@app/components/policies/useEditorPipelines";
import { ActionIcon } from "@app/ui/ActionIcon";
import "@app/components/policies/EditorPipelinesPanel.css";

const PIPELINES_PATH = `${PORTAL_BASENAME}/pipelines`;
const ICON_SX = { fontSize: "1.05rem" } as const;
const TRIGGER_SX = { fontSize: "0.8125rem" } as const;

function rowState(pipeline: EditorPipeline): "running" | "failed" | "idle" {
  if (pipeline.running) return "running";
  return pipeline.failed ? "failed" : "idle";
}

function PipelineRow({
  pipeline,
  onOpen,
}: {
  pipeline: EditorPipeline;
  onOpen: (() => void) | null;
}) {
  const { t } = useTranslation();
  const state = rowState(pipeline);
  const label =
    state === "running"
      ? t("policies.editorPanel.rowRunning", "{{label}} is running now", {
          label: pipeline.label,
        })
      : state === "failed"
        ? t("policies.editorPanel.rowFailed", "{{label}} — last run failed", {
            label: pipeline.label,
          })
        : t("policies.editorPanel.rowIdle", "{{label}} runs automatically", {
            label: pipeline.label,
          });
  const trigger =
    pipeline.runOn === "export"
      ? t("policies.editorPanel.triggerExport", "Runs on export")
      : t("policies.editorPanel.triggerImport", "Runs on import");
  const TriggerIcon =
    pipeline.runOn === "export" ? OutputOutlinedIcon : InputOutlinedIcon;

  const body = (
    <>
      <span className="editor-pipelines__row-icon" aria-hidden>
        {policyCategoryIcon(pipeline.policyKey, ICON_SX)}
      </span>
      <span className="editor-pipelines__row-label">{pipeline.label}</span>
      <TriggerIcon
        className="editor-pipelines__row-trigger"
        sx={TRIGGER_SX}
        titleAccess={trigger}
      />
      {pipeline.runsToday > 0 && (
        <span
          className="editor-pipelines__row-count"
          title={t("policies.editorPanel.runsToday", "{{count}} runs today", {
            count: pipeline.runsToday,
          })}
        >
          {pipeline.runsToday}
        </span>
      )}
      <span className="editor-pipelines__dot" data-state={state} aria-hidden />
    </>
  );

  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          className="editor-pipelines__row"
          onClick={onOpen}
          title={label}
        >
          {body}
        </button>
      ) : (
        <div className="editor-pipelines__row" title={label}>
          {body}
        </div>
      )}
    </li>
  );
}

export interface EditorPipelinesPanelViewProps extends EditorPipelines {
  onOpenProcessor: (() => void) | null;
}

export function EditorPipelinesPanelView({
  onImport,
  onExport,
  total,
  onOpenProcessor,
}: EditorPipelinesPanelViewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <section className="editor-pipelines">
      <div className="editor-pipelines__head">
        <button
          type="button"
          className="editor-pipelines__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          disabled={total === 0}
          title={
            open
              ? t("policies.editorPanel.collapse", "Hide pipelines")
              : t("policies.editorPanel.expand", "Show pipelines")
          }
        >
          <span className="editor-pipelines__title">
            {t("policies.editorPanel.title", "PDF Processor")}
          </span>
          {total > 0 && (
            <ExpandMoreIcon
              className="editor-pipelines__chevron"
              data-open={open}
              sx={{ fontSize: "1.1rem" }}
            />
          )}
        </button>
        {onOpenProcessor && (
          <ActionIcon
            variant="tertiary"
            size="md"
            shape="circle"
            onClick={onOpenProcessor}
            aria-label={t(
              "policies.editorPanel.openProcessor",
              "Open the PDF Processor",
            )}
          >
            <OpenInNewIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>
        )}
      </div>

      {total === 0 ? (
        <p className="editor-pipelines__empty">
          {t(
            "policies.editorPanel.empty",
            "Nothing runs on import or export yet",
          )}
        </p>
      ) : (
        open && (
          <ul className="editor-pipelines__list">
            {[...onImport, ...onExport].map((pipeline) => (
              <PipelineRow
                key={pipeline.policyKey}
                pipeline={pipeline}
                onOpen={onOpenProcessor}
              />
            ))}
          </ul>
        )
      )}
    </section>
  );
}

export function EditorPipelinesPanel() {
  const pipelines = useEditorPipelines();
  const { portalAccess } = useAuth();
  const navigate = useNavigate();
  const { actions } = useNavigationActions();

  const openProcessor = portalAccess
    ? () =>
        actions.requestNavigation(() => {
          saveEditorReturnPath();
          navigate(PIPELINES_PATH);
        })
    : null;

  return (
    <EditorPipelinesPanelView {...pipelines} onOpenProcessor={openProcessor} />
  );
}
