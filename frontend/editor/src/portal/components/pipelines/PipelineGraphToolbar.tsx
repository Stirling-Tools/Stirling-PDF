import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import { ActionIcon, Button, FilePicker, Spinner } from "@app/ui";
import "@portal/components/pipelines/PipelineGraphToolbar.css";

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

export interface PipelineGraphToolbarProps {
  /** How many steps the chain has, so an empty pipeline cannot offer a test that does nothing. */
  stepCount: number;
  /** Run the steps as they stand against one uploaded file, without saving or delivering. */
  onTest: (file: File) => void;
  testing: boolean;
  /** The last test run in this session, or null if there has not been one. */
  runResult: RunResultSummary | null;
  onDownloadOutput: (output: RunOutputFile) => void;
  /** Opens the definition (JSON + cURL) - an inspect action, sibling to Test, hence its home here. */
  onViewDefinition: () => void;
}

/**
 * The graph's own toolbar, above the canvas in both create and edit. It gathers the two ways to
 * *inspect* what you are building - testing the chain against one file, and reading its definition -
 * as opposed to committing (Save/Create) or operating on the live pipeline (Run now). A test run's
 * progress shows on the graph's nodes, so the strip that summarises it belongs next to the graph too.
 */
export function PipelineGraphToolbar({
  stepCount,
  onTest,
  testing,
  runResult,
  onDownloadOutput,
  onViewDefinition,
}: PipelineGraphToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="portal-pipeline-toolbar">
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

      {runResult && (
        <RunResultStrip result={runResult} onDownload={onDownloadOutput} />
      )}

      {/* The graph is the visual definition; reading it as JSON/cURL sits at the far end of its bar. */}
      <Tooltip
        label={t("portal.pipelines.builder.viewDefinition")}
        position="bottom"
        withinPortal
      >
        <ActionIcon
          variant="tertiary"
          size="sm"
          className="portal-pipeline-toolbar__definition"
          onClick={onViewDefinition}
          aria-label={t("portal.pipelines.builder.viewDefinition")}
        >
          <CodeRoundedIcon style={{ fontSize: "1.125rem" }} />
        </ActionIcon>
      </Tooltip>
    </div>
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
    <div className="portal-pipeline-toolbar__result">
      <div className="portal-pipeline-toolbar__result-status">
        {result.status === "running" && <Spinner size="sm" />}
        {result.status === "completed" && (
          <CheckCircleOutlineRoundedIcon
            className="portal-pipeline-toolbar__result-icon is-ok"
            style={{ fontSize: "1.25rem" }}
          />
        )}
        {result.status === "failed" && (
          <ErrorOutlineRoundedIcon
            className="portal-pipeline-toolbar__result-icon is-bad"
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
        <span className="portal-pipeline-toolbar__result-error">
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
