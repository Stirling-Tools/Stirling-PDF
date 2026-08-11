import { useTranslation } from "react-i18next";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { Button, FilePicker, Spinner } from "@app/ui";
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
}

/**
 * Testing sits directly above the graph, in both create and edit: it is a build activity - trying
 * the chain as it stands against one file - not an operational action on a saved pipeline. That is
 * why it lives here and not beside "Run now", which fires the real, saved pipeline at its real
 * sources. A run's progress shows on the graph's nodes, so the strip that summarises it belongs
 * next to the graph too.
 */
export function PipelineGraphToolbar({
  stepCount,
  onTest,
  testing,
  runResult,
  onDownloadOutput,
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
