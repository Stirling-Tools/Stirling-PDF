import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import {
  ActionIcon,
  Button,
  Checkbox,
  Dropdown,
  FilePicker,
  Input,
  Spinner,
} from "@app/ui";
import "@app/ui/Surface.css";
import "@portal/components/pipelines/PipelineHeader.css";

/** One file a test run produced, downloadable from the result strip. */
export interface RunOutputFile {
  fileId: string;
  fileName: string | null;
}

/**
 * A test run's outcome. Whole-pipeline, not per-node: the backend reports one flat list of files
 * plus the step it stopped at, so there is no per-node output to attach to a node.
 */
export interface RunResultSummary {
  status: "running" | "completed" | "failed";
  completedSteps: number;
  stepCount: number;
  error?: string | null;
  outputs?: RunOutputFile[];
}

export interface PipelineHeaderProps {
  name: string;
  onNameChange: (name: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** False for a pipeline that has never been saved: it cannot yet be run, cleared or deleted. */
  isEdit: boolean;
  /** How many steps the chain has, so an empty pipeline cannot offer a test that does nothing. */
  stepCount: number;

  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onBack: () => void;

  /** Run the steps as they stand against one uploaded file, without saving or delivering. */
  onTest: (file: File) => void;
  testing: boolean;
  /** Run the saved pipeline against its real input, delivering to its real destination. */
  onRun: () => void;
  running: boolean;
  onClearHistory: () => void;
  clearingHistory: boolean;
  onDelete: () => void;

  /** Opens the definition (JSON + cURL), which is pipeline-scoped like the rest of this row. */
  onViewDefinition: () => void;
  /** The last test run in this session, or null if there has not been one. */
  runResult: RunResultSummary | null;
  onDownloadOutput: (output: RunOutputFile) => void;
}

/**
 * The pipeline's identity and its whole-pipeline actions, at the top of the builder.
 *
 * Split in two so neither half gets lost in a single crowded row: what the pipeline *is* (name,
 * whether it is live) sits with the actions that leave the page, and what you can *do to it* sits
 * below the rule. A test run is part of building, so it lives here rather than off in a corner -
 * its progress shows on the graph's nodes and its results in the inspector.
 */
export function PipelineHeader({
  name,
  onNameChange,
  enabled,
  onEnabledChange,
  isEdit,
  stepCount,
  canSave,
  saving,
  onSave,
  onCancel,
  onBack,
  onTest,
  testing,
  onRun,
  running,
  onClearHistory,
  clearingHistory,
  onDelete,
  onViewDefinition,
  runResult,
  onDownloadOutput,
}: PipelineHeaderProps) {
  const { t } = useTranslation();

  return (
    <section className="sui-surface portal-pipeline-header">
      <div className="portal-pipeline-header__top">
        <Button
          variant="quiet"
          size="sm"
          className="portal-pipeline-header__back"
          onClick={onBack}
          leftSection={
            <ArrowBackRoundedIcon style={{ fontSize: "1.125rem" }} />
          }
        >
          {t("portal.pipelines.builder.back")}
        </Button>
        <div className="portal-pipeline-header__save">
          <Button fat variant="tertiary" onClick={onCancel} disabled={saving}>
            {t("portal.pipelines.composer.cancel")}
          </Button>
          <Button fat onClick={onSave} loading={saving} disabled={!canSave}>
            {isEdit
              ? t("portal.pipelines.composer.save")
              : t("portal.pipelines.composer.create")}
          </Button>
        </div>
      </div>

      <div className="portal-pipeline-header__identity">
        <Input
          className="portal-pipeline-header__name"
          value={name}
          placeholder={t("portal.pipelines.composer.namePlaceholder")}
          aria-label={t("portal.pipelines.composer.name")}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {/* A checkbox, not a switch: this is a form value that takes effect on save, and a switch
            would imply it applies the moment it is flipped. No description - a second line beside
            the single-line name field leaves the row ragged. */}
        <Checkbox
          className="portal-pipeline-header__enabled"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          label={t("portal.pipelines.builder.enabled")}
        />
      </div>

      <div className="portal-pipeline-header__actions">
        <FilePicker
          variant="secondary"
          size="sm"
          accept="application/pdf"
          loading={testing}
          // A chain with no steps would hand the file straight back, reading as a silent no-op.
          disabled={stepCount === 0}
          onChange={(file) => file && onTest(file)}
          leftSection={<ScienceOutlinedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("portal.pipelines.builder.testRun")}
        </FilePicker>

        {isEdit && (
          <Button
            variant="secondary"
            size="sm"
            loading={running}
            onClick={onRun}
            leftSection={
              <PlayArrowRoundedIcon style={{ fontSize: "1.125rem" }} />
            }
          >
            {t("portal.pipelines.detail.run")}
          </Button>
        )}

        {/* Occasional things - reading the definition, wiping the processed history - kept behind a
            tray so they do not compete with running and testing, which is what this row is for. */}
        <Dropdown.Root align="start">
          <Dropdown.Trigger>
            <ActionIcon
              variant="secondary"
              size="sm"
              aria-label={t("portal.pipelines.builder.moreActions")}
            >
              <MoreHorizRoundedIcon style={{ fontSize: "1.125rem" }} />
            </ActionIcon>
          </Dropdown.Trigger>
          <Dropdown.Menu>
            <Dropdown.Item
              onSelect={onViewDefinition}
              leading={<CodeRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.pipelines.builder.viewDefinition")}
            </Dropdown.Item>
            {isEdit && (
              <Dropdown.Item
                onSelect={onClearHistory}
                disabled={clearingHistory}
                leading={
                  <HistoryRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("portal.pipelines.detail.clearHistory")}
              </Dropdown.Item>
            )}
          </Dropdown.Menu>
        </Dropdown.Root>

        {isEdit && (
          <Button
            variant="tertiary"
            size="sm"
            accent="danger"
            className="portal-pipeline-header__delete"
            onClick={onDelete}
            leftSection={
              <DeleteOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
            }
          >
            {t("portal.pipelines.detail.delete")}
          </Button>
        )}
      </div>

      {runResult && (
        <RunResultStrip result={runResult} onDownload={onDownloadOutput} />
      )}
    </section>
  );
}

interface RunResultStripProps {
  result: RunResultSummary;
  onDownload: (output: RunOutputFile) => void;
}

/** What the last test run did, beside the button that started it. */
function RunResultStrip({ result, onDownload }: RunResultStripProps) {
  const { t } = useTranslation();
  const outputs = result.outputs ?? [];

  return (
    <div className="portal-pipeline-header__result">
      <div className="portal-pipeline-header__result-status">
        {result.status === "running" && <Spinner size="sm" />}
        {result.status === "completed" && (
          <CheckCircleOutlineRoundedIcon
            className="portal-pipeline-header__result-icon is-ok"
            style={{ fontSize: "1.25rem" }}
          />
        )}
        {result.status === "failed" && (
          <ErrorOutlineRoundedIcon
            className="portal-pipeline-header__result-icon is-bad"
            style={{ fontSize: "1.25rem" }}
          />
        )}
        <span>
          {t(`portal.pipelines.inspector.status.${result.status}`, {
            done: result.completedSteps,
            count: result.stepCount,
          })}
        </span>
      </div>

      {/* The reason it failed, where the failure is announced - not only on the node, which the user
          has to know to click. */}
      {result.status === "failed" && result.error && (
        <span className="portal-pipeline-header__result-error">
          {result.error}
        </span>
      )}

      {outputs.map((output) => (
        <Button
          key={output.fileId}
          variant="tertiary"
          size="sm"
          onClick={() => onDownload(output)}
          leftSection={<DownloadRoundedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {output.fileName ?? output.fileId}
        </Button>
      ))}
    </div>
  );
}
