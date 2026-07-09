import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import {
  ActionIcon,
  Banner,
  Button,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Modal,
  RadioGroup,
  Select,
  Spinner,
} from "@app/ui";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { type ErasedToolParams } from "@app/hooks/tools/shared/toolOperationTypes";
import {
  deserializeToolStep,
  getExecutableTools,
  newWorkingToolStep,
  serializeToolStep,
  stepRequiresUpload,
  type ExecutableTool,
  type WorkingToolStep,
} from "@app/hooks/tools/shared/toolAutomation";
import { errorMessage } from "@portal/api/http";
import {
  deletePipeline,
  fetchPipeline,
  fetchRun,
  fetchTriggers,
  savePipeline,
  triggerPipeline,
  type OutputSpec,
  type Policy,
  type PolicyRunView,
  type TriggerConfig,
  type TriggerInfo,
  type TriggerOutcome,
} from "@portal/api/pipelines";
import { clearProcessedHistory } from "@portal/api/policies";
import { fetchSources, type SourceView } from "@portal/api/sources";
import { useAsync } from "@portal/hooks/useAsync";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { humanizeOperation } from "@portal/components/pipelines/pipelineOperations";
import { PipelineStepSettings } from "@portal/components/pipelines/PipelineStepSettings";
import { ToolPicker } from "@portal/components/pipelines/ToolPicker";
import "@portal/views/PipelineBuilder.css";

type OutputMode = "inline" | "folder" | "s3";

/** The s3 output's connection fields, mirrored from the OutputSpec options. */
interface S3OutputOptions {
  bucket: string;
  region: string;
  prefix: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const EMPTY_S3_OUTPUT: S3OutputOptions = {
  bucket: "",
  region: "us-east-1",
  prefix: "",
  endpoint: "",
  accessKeyId: "",
  secretAccessKey: "",
};
type ScheduleUnit = "MINUTES" | "HOURS" | "DAYS";

const SCHEDULE_UNITS: ScheduleUnit[] = ["MINUTES", "HOURS", "DAYS"];
/** Empty trigger type = manual-only (no automatic trigger). */
const MANUAL = "";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 60;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RunResult = {
  tone: "success" | "danger" | "info" | "warning";
  text: string;
};

function parseTrigger(trigger: TriggerConfig | null): {
  triggerType: string;
  count: string;
  unit: ScheduleUnit;
} {
  if (!trigger) return { triggerType: MANUAL, count: "1", unit: "HOURS" };
  if (trigger.type === "schedule") {
    const schedule = trigger.options?.schedule as
      | { type?: string; count?: number; unit?: ScheduleUnit }
      | undefined;
    if (schedule?.type === "every") {
      return {
        triggerType: "schedule",
        count: String(schedule.count ?? 1),
        unit: schedule.unit ?? "HOURS",
      };
    }
    return { triggerType: "schedule", count: "1", unit: "HOURS" };
  }
  return { triggerType: trigger.type, count: "1", unit: "HOURS" };
}

function parseOutput(output: OutputSpec | undefined): {
  mode: OutputMode;
  directory: string;
  s3: S3OutputOptions;
} {
  if (output?.type === "folder") {
    return {
      mode: "folder",
      directory: String(output.options?.directory ?? ""),
      s3: EMPTY_S3_OUTPUT,
    };
  }
  if (output?.type === "s3") {
    const option = (key: keyof S3OutputOptions, fallback = "") =>
      String(output.options?.[key] ?? fallback);
    return {
      mode: "s3",
      directory: "",
      s3: {
        bucket: option("bucket"),
        region: option("region", "us-east-1"),
        prefix: option("prefix"),
        endpoint: option("endpoint"),
        accessKeyId: option("accessKeyId"),
        secretAccessKey: option("secretAccessKey"),
      },
    };
  }
  return { mode: "inline", directory: "", s3: EMPTY_S3_OUTPUT };
}

/**
 * Full-page pipeline builder (route: /pipelines/new and /pipelines/:id). Pipeline-level settings
 * (sources, trigger, output) sit above the operation list; the operation list and the selected
 * tool's settings sit side by side below. For an existing pipeline the header also runs and
 * deletes it. Replaces the former modal composer and the list's inline detail card.
 */
export function PipelineBuilder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { allTools } = useToolRegistry();
  const executableTools = useMemo(
    () => getExecutableTools(allTools),
    [allTools],
  );

  const policyState = useAsync<Policy | null>(
    async () => (id ? await fetchPipeline(id) : null),
    [id],
  );
  const sourcesState = useAsync<SourceView[]>(
    async () => (await fetchSources()).sources,
    [],
  );
  const triggersState = useAsync<TriggerInfo[]>(
    async () => await fetchTriggers(),
    [],
  );
  const availableSources = sourcesState.data ?? [];
  const triggers = useMemo(
    () => triggersState.data ?? [],
    [triggersState.data],
  );

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<WorkingToolStep[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [triggerType, setTriggerType] = useState<string>(MANUAL);
  const [scheduleCount, setScheduleCount] = useState("1");
  const [scheduleUnit, setScheduleUnit] = useState<ScheduleUnit>("HOURS");
  const [outputMode, setOutputMode] = useState<OutputMode>("inline");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [outputS3, setOutputS3] = useState<S3OutputOptions>(EMPTY_S3_OUTPUT);
  const [s3ConfigOpen, setS3ConfigOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [running, setRunning] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Seed the form once: immediately for a new pipeline, or after the policy loads for an edit.
  useEffect(() => {
    if (seeded) return;
    if (isEdit && !policyState.data) return;
    const policy = policyState.data ?? undefined;
    const trigger = parseTrigger(policy?.trigger ?? null);
    const output = parseOutput(policy?.output);
    setName(policy?.name ?? "");
    setEnabled(policy?.enabled ?? true);
    setSourceIds(policy?.sourceIds ?? []);
    setSteps(
      (policy?.steps ?? []).map((step) => deserializeToolStep(step, allTools)),
    );
    setTriggerType(trigger.triggerType);
    setScheduleCount(trigger.count);
    setScheduleUnit(trigger.unit);
    setOutputMode(output.mode);
    setOutputDirectory(output.directory);
    setOutputS3(output.s3);
    setSeeded(true);
  }, [isEdit, policyState.data, allTools, seeded]);

  // Keep one tool's settings open: auto-select the first step whenever a pipeline has steps but
  // nothing is selected (initial load, or after the selected step is removed).
  useEffect(() => {
    if (seeded && selectedIndex === null && steps.length > 0) {
      setSelectedIndex(0);
    }
  }, [seeded, selectedIndex, steps.length]);

  const selectedSourceTypes = useMemo(
    () =>
      new Set(
        availableSources
          .filter((s) => sourceIds.includes(s.id))
          .map((s) => s.type),
      ),
    [availableSources, sourceIds],
  );

  const triggerAvailable = useMemo(
    () => (trigger: TriggerInfo) =>
      !trigger.requiresSource ||
      trigger.supportedSourceTypes.some((type) =>
        selectedSourceTypes.has(type),
      ),
    [selectedSourceTypes],
  );

  useEffect(() => {
    if (triggerType === MANUAL) return;
    const selected = triggers.find((trigger) => trigger.type === triggerType);
    if (selected && !triggerAvailable(selected)) setTriggerType(MANUAL);
  }, [triggerType, triggers, triggerAvailable]);

  function setS3Field(key: keyof S3OutputOptions, value: string) {
    setOutputS3((current) => ({ ...current, [key]: value }));
  }

  function toggleSource(sourceId: string, checked: boolean) {
    setSourceIds((ids) =>
      checked
        ? [...ids, sourceId]
        : ids.filter((existing) => existing !== sourceId),
    );
  }

  function addStep(tool: ExecutableTool) {
    setSteps((current) => {
      const next = [...current, newWorkingToolStep(tool, allTools)];
      setSelectedIndex(next.length - 1);
      return next;
    });
    setPickerOpen(false);
  }

  function removeStep(index: number) {
    setSelectedIndex(null);
    setSteps((current) => current.filter((_, i) => i !== index));
  }

  function moveStep(index: number, delta: number) {
    setSteps((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelectedIndex((cur) => (cur === index ? index + delta : cur));
  }

  function updateStepParams(index: number, params: ErasedToolParams) {
    setSteps((current) =>
      current.map((step, i) =>
        i === index && step.toolId !== null ? { ...step, params } : step,
      ),
    );
  }

  function stepLabel(step: WorkingToolStep): string {
    const entry = step.toolId ? allTools[step.toolId] : undefined;
    return entry?.name ?? humanizeOperation(step.operation);
  }

  // Steps whose params carry an uploaded file can't be saved: the bytes aren't persisted with the
  // policy, so a later run would send null for that field (see stepRequiresUpload).
  const uploadStepLabels = steps.filter(stepRequiresUpload).map(stepLabel);
  const hasUploadSteps = uploadStepLabels.length > 0;

  // Track unsaved edits: snapshot the form and compare against the state captured just after
  // seeding, so leaving the builder can prompt to save or discard.
  const snapshot = JSON.stringify({
    name: name.trim(),
    enabled,
    sourceIds: [...sourceIds].sort(),
    steps: steps.map((step) => serializeToolStep(step, allTools)),
    uploads: steps.map(stepRequiresUpload),
    triggerType,
    scheduleCount,
    scheduleUnit,
    outputMode,
    outputDirectory,
    outputS3,
  });
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    if (seeded && baseline.current === null) baseline.current = snapshot;
  }, [seeded, snapshot]);
  const dirty = baseline.current !== null && baseline.current !== snapshot;

  const scheduleCountValid =
    triggerType !== "schedule" || Number(scheduleCount) > 0;
  const s3OutputValid =
    outputMode !== "s3" ||
    (outputS3.bucket.trim() !== "" &&
      (outputS3.accessKeyId.trim() === "") ===
        (outputS3.secretAccessKey.trim() === ""));
  const outputValid =
    (outputMode !== "folder" || outputDirectory.trim() !== "") && s3OutputValid;
  const canSave =
    name.trim() !== "" &&
    scheduleCountValid &&
    outputValid &&
    !hasUploadSteps &&
    !submitting;

  const triggerOptions = [
    { value: MANUAL, label: t("portal.pipelines.composer.triggerManual") },
    ...triggers.map((trigger) => ({
      value: trigger.type,
      label: t(`portal.pipelines.trigger.${trigger.type}`, {
        defaultValue: trigger.type,
      }),
      disabled: !triggerAvailable(trigger),
    })),
  ];

  function buildTrigger(): TriggerConfig | null {
    if (triggerType === MANUAL) return null;
    if (triggerType === "schedule") {
      return {
        type: "schedule",
        options: {
          schedule: {
            type: "every",
            count: Number(scheduleCount),
            unit: scheduleUnit,
          },
        },
      };
    }
    return { type: triggerType, options: {} };
  }

  const listPath = toPortalPath(VIEW_PATHS.pipelines);
  const sourcesPath = `${toPortalPath(VIEW_PATHS.sources)}?new=1`;

  function close() {
    navigate(listPath);
  }

  // Leave the builder, but prompt first if there are unsaved edits (see the unsaved-changes modal).
  function attemptLeave(destination: string) {
    if (dirty) setPendingNav(destination);
    else navigate(destination);
  }

  // Jump to the Sources page with its create wizard open, for when the source you want to run
  // this pipeline over doesn't exist yet.
  function goToSources() {
    attemptLeave(sourcesPath);
  }

  async function save(destination: string) {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    const output: OutputSpec =
      outputMode === "folder"
        ? { type: "folder", options: { directory: outputDirectory.trim() } }
        : outputMode === "s3"
          ? { type: "s3", options: { ...outputS3 } }
          : { type: "inline", options: {} };
    const policy: Policy = {
      id: policyState.data?.id ?? undefined,
      name: name.trim(),
      enabled,
      trigger: buildTrigger(),
      sourceIds,
      steps: steps.map((step) => serializeToolStep(step, allTools)),
      output,
    };
    try {
      await savePipeline(policy);
      navigate(destination);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  // Poll a run until it reaches a terminal state (or we give up), so a failure surfaces.
  async function awaitRun(runId: string): Promise<PolicyRunView | null> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      if (!mounted.current) return null;
      const view = await fetchRun(runId);
      if (TERMINAL_STATUSES.has(view.status)) return view;
      await sleep(POLL_INTERVAL_MS);
    }
    return null;
  }

  /** Explain an empty trigger: parked files outrank blander reasons. */
  function emptySweepResult(outcome: TriggerOutcome): RunResult {
    if (outcome.parked > 0) {
      return {
        tone: "warning",
        text: t("portal.pipelines.run.parked", { count: outcome.parked }),
      };
    }
    if (outcome.inFlight > 0) {
      return { tone: "info", text: t("portal.pipelines.run.inFlight") };
    }
    if (outcome.alreadyProcessed > 0) {
      return {
        tone: "info",
        text: t("portal.pipelines.run.allProcessed", {
          count: outcome.alreadyProcessed,
        }),
      };
    }
    return { tone: "info", text: t("portal.pipelines.run.empty") };
  }

  async function handleRun() {
    if (running || !id) return;
    setRunning(true);
    setRunResult(null);
    try {
      const outcome = await triggerPipeline(id);
      const runIds = outcome.runIds;
      if (runIds.length === 0) {
        if (mounted.current) setRunResult(emptySweepResult(outcome));
        return;
      }
      const finals = await Promise.all(runIds.map((runId) => awaitRun(runId)));
      if (!mounted.current) return;
      const failed = finals.find((r) => r?.status === "FAILED");
      if (failed) {
        setRunResult({
          tone: "danger",
          text: t("portal.pipelines.run.failed", { error: failed.error ?? "" }),
        });
      } else if (finals.some((r) => r === null)) {
        // Gave up polling before a terminal status; the run may still finish server-side.
        setRunResult({
          tone: "warning",
          text: t("portal.pipelines.run.timeout"),
        });
      } else if (finals.every((r) => r?.status === "COMPLETED")) {
        setRunResult({
          tone: "success",
          text: t("portal.pipelines.run.completed", { count: finals.length }),
        });
      } else {
        setRunResult({ tone: "info", text: t("portal.pipelines.run.running") });
      }
    } catch (e) {
      if (mounted.current)
        setRunResult({ tone: "danger", text: errorMessage(e) });
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

  /**
   * Forget which source files this pipeline has processed, so the next sweep
   * reprocesses everything currently in its sources (the standard retry for a
   * parked-by-failure file). Does not touch the files themselves.
   */
  async function handleClearHistory() {
    if (clearingHistory || !id) return;
    setClearingHistory(true);
    setRunResult(null);
    try {
      await clearProcessedHistory(id);
      if (mounted.current)
        setRunResult({
          tone: "success",
          text: t("portal.pipelines.run.historyCleared"),
        });
    } catch (e) {
      if (mounted.current)
        setRunResult({ tone: "danger", text: errorMessage(e) });
    } finally {
      if (mounted.current) setClearingHistory(false);
    }
  }

  async function confirmDelete() {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await deletePipeline(id);
      close();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
      setPendingDelete(false);
    }
  }

  if (isEdit && !seeded) {
    return (
      <div className="portal-builder__loading">
        <Spinner />
      </div>
    );
  }

  const selectedStep =
    selectedIndex !== null ? (steps[selectedIndex] ?? null) : null;

  return (
    <div className="portal-builder">
      <header className="portal-builder__head">
        <Button
          variant="quiet"
          size="sm"
          className="portal-builder__back"
          onClick={() => attemptLeave(listPath)}
          aria-label={t("portal.pipelines.builder.back")}
          leftSection={
            <ArrowBackRoundedIcon style={{ fontSize: "1.125rem" }} />
          }
        >
          {t("portal.pipelines.title")}
        </Button>
        <div className="portal-builder__head-main">
          <Input
            value={name}
            placeholder={t("portal.pipelines.composer.namePlaceholder")}
            aria-label={t("portal.pipelines.composer.name")}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="portal-builder__head-actions">
          <Checkbox
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            label={t("portal.pipelines.builder.enabled")}
          />
          {isEdit && (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={running}
                onClick={handleRun}
                leftSection={
                  <PlayArrowRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("portal.pipelines.detail.run")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={clearingHistory}
                onClick={handleClearHistory}
                leftSection={
                  <HistoryRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("portal.pipelines.detail.clearHistory")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                accent="danger"
                onClick={() => setPendingDelete(true)}
                leftSection={
                  <DeleteOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("portal.pipelines.detail.delete")}
              </Button>
            </>
          )}
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => attemptLeave(listPath)}
            disabled={submitting}
          >
            {t("portal.pipelines.composer.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => save(listPath)}
            loading={submitting}
            disabled={!canSave}
          >
            {isEdit
              ? t("portal.pipelines.composer.save")
              : t("portal.pipelines.composer.create")}
          </Button>
        </div>
      </header>

      {error && <Banner tone="danger" description={error} />}
      {runResult && (
        <Banner tone={runResult.tone} description={runResult.text} />
      )}
      {hasUploadSteps && (
        <Banner
          tone="warning"
          description={t("portal.pipelines.builder.uploadUnsupported", {
            tools: uploadStepLabels.join(", "),
          })}
        />
      )}

      {/* Pipeline-level settings, above the operation list. */}
      <section className="portal-builder__settings">
        <div className="portal-builder__section-label">
          {t("portal.pipelines.builder.pipelineSettings")}
        </div>
        <div className="portal-builder__settings-grid">
          <div className="portal-builder__settings-col">
            <span className="portal-pipelines__detail-heading">
              {t("portal.pipelines.composer.sources")}
            </span>
            {sourcesState.loading ? (
              <p className="portal-pipelines__muted">
                {t("portal.pipelines.composer.sourcesLoading")}
              </p>
            ) : availableSources.length === 0 ? (
              <p className="portal-pipelines__muted">
                {t("portal.pipelines.composer.noSources")}
              </p>
            ) : (
              <div className="portal-pipelines__source-list">
                {availableSources.map((source) => (
                  <Checkbox
                    key={source.id}
                    checked={sourceIds.includes(source.id)}
                    onChange={(e) => toggleSource(source.id, e.target.checked)}
                    label={source.name}
                  />
                ))}
              </div>
            )}
            <Button
              variant="tertiary"
              size="sm"
              onClick={goToSources}
              leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.sources.actions.connectSource")}
            </Button>
          </div>

          <div className="portal-builder__settings-col">
            <span className="portal-pipelines__detail-heading">
              {t("portal.pipelines.composer.trigger")}
            </span>
            <RadioGroup<string>
              name="pipeline-trigger"
              value={triggerType}
              onChange={setTriggerType}
              options={triggerOptions}
            />
            {triggerType === "schedule" && (
              <div className="portal-pipelines__schedule">
                <span className="portal-pipelines__muted">
                  {t("portal.pipelines.composer.scheduleEvery")}
                </span>
                <Input
                  inputSize="sm"
                  type="number"
                  min={1}
                  value={scheduleCount}
                  invalid={!scheduleCountValid}
                  onChange={(e) => setScheduleCount(e.target.value)}
                  className="portal-pipelines__schedule-count"
                />
                <Select
                  inputSize="sm"
                  value={scheduleUnit}
                  onChange={(value) =>
                    value && setScheduleUnit(value as ScheduleUnit)
                  }
                  options={SCHEDULE_UNITS.map((unit) => ({
                    value: unit,
                    label: t(
                      `portal.pipelines.composer.unit.${unit.toLowerCase()}`,
                    ),
                  }))}
                />
              </div>
            )}
          </div>

          <div className="portal-builder__settings-col">
            <span className="portal-pipelines__detail-heading">
              {t("portal.pipelines.composer.output")}
            </span>
            <RadioGroup<OutputMode>
              name="pipeline-output"
              value={outputMode}
              onChange={setOutputMode}
              options={[
                { value: "inline", label: t("portal.pipelines.output.inline") },
                { value: "folder", label: t("portal.pipelines.output.folder") },
                { value: "s3", label: t("portal.pipelines.output.s3") },
              ]}
            />
            {outputMode === "folder" && (
              <FormField
                label={t("portal.pipelines.composer.directory")}
                helperText={t("portal.pipelines.composer.directoryHelp")}
                required
              >
                <Input
                  value={outputDirectory}
                  placeholder="/data/processed"
                  onChange={(e) => setOutputDirectory(e.target.value)}
                />
              </FormField>
            )}
            {outputMode === "s3" && (
              <div className="portal-builder__s3-output">
                <span
                  className={
                    "portal-builder__s3-summary" +
                    (outputS3.bucket ? "" : " is-unset")
                  }
                >
                  {outputS3.bucket
                    ? `s3://${outputS3.bucket}/${outputS3.prefix}`
                    : t("portal.pipelines.composer.s3NotConfigured")}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setS3ConfigOpen(true)}
                >
                  {t("portal.pipelines.composer.s3Configure")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="portal-builder__grid">
        <section className="portal-builder__flow">
          <div className="portal-builder__section-label">
            {t("portal.pipelines.composer.operations", { count: steps.length })}
          </div>

          {steps.length === 0 && !pickerOpen && (
            <p className="portal-builder__empty">
              {t("portal.pipelines.composer.chainEmpty")}
            </p>
          )}

          <ol className="portal-builder__steps">
            {steps.map((step, i) => (
              <li key={`${step.operation}-${i}`}>
                <div
                  className={
                    "portal-builder__step" +
                    (selectedIndex === i ? " portal-builder__step--active" : "")
                  }
                >
                  <Button
                    variant="quiet"
                    justify="start"
                    className="portal-builder__step-main"
                    onClick={() => setSelectedIndex(i)}
                    leftSection={
                      <span className="portal-builder__step-index">
                        {i + 1}
                      </span>
                    }
                  >
                    <span className="portal-builder__step-text">
                      <span className="portal-builder__step-name">
                        {stepLabel(step)}
                      </span>
                      {stepRequiresUpload(step) ? (
                        <span className="portal-builder__step-note">
                          {t("portal.pipelines.builder.needsUpload")}
                        </span>
                      ) : step.support === "unsupported" ? (
                        <span className="portal-builder__step-note">
                          {t("portal.pipelines.builder.usesDefaults")}
                        </span>
                      ) : step.support === "unknown" ? (
                        <span className="portal-builder__step-note">
                          {t("portal.pipelines.builder.unknownStep")}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                  <div className="portal-builder__step-actions">
                    <ActionIcon
                      variant="tertiary"
                      aria-label={t("portal.pipelines.composer.moveUp")}
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                    >
                      <KeyboardArrowUpRoundedIcon
                        style={{ fontSize: "1.125rem" }}
                      />
                    </ActionIcon>
                    <ActionIcon
                      variant="tertiary"
                      aria-label={t("portal.pipelines.composer.moveDown")}
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                    >
                      <KeyboardArrowDownRoundedIcon
                        style={{ fontSize: "1.125rem" }}
                      />
                    </ActionIcon>
                    <ActionIcon
                      variant="tertiary"
                      aria-label={t("portal.pipelines.composer.removeStep")}
                      onClick={() => removeStep(i)}
                    >
                      <DeleteOutlineRoundedIcon
                        style={{ fontSize: "1.125rem" }}
                      />
                    </ActionIcon>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {pickerOpen ? (
            <ToolPicker
              tools={executableTools}
              onPick={addStep}
              onClose={() => setPickerOpen(false)}
            />
          ) : (
            <Button
              variant="quiet"
              fullWidth
              className="portal-builder__add-step"
              onClick={() => setPickerOpen(true)}
              leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            >
              {t("portal.pipelines.composer.addTool")}
            </Button>
          )}
        </section>

        <aside className="portal-builder__inspector-col">
          <div className="portal-builder__section-label">
            {selectedStep
              ? stepLabel(selectedStep)
              : t("portal.pipelines.builder.toolSettings")}
          </div>
          <div className="portal-builder__inspector">
            {selectedStep ? (
              <PipelineStepSettings
                step={selectedStep}
                registry={allTools}
                onChange={(params) =>
                  selectedIndex !== null &&
                  updateStepParams(selectedIndex, params)
                }
              />
            ) : (
              <EmptyState
                title={t("portal.pipelines.builder.selectToolTitle")}
                description={t("portal.pipelines.builder.selectToolBody")}
              />
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={pendingDelete}
        onClose={() => !deleting && setPendingDelete(false)}
        width="sm"
        title={t("portal.pipelines.delete.title")}
        footer={
          <div className="portal-pipelines__composer-footer">
            <Button
              variant="tertiary"
              size="sm"
              disabled={deleting}
              onClick={() => setPendingDelete(false)}
            >
              {t("portal.pipelines.delete.cancel")}
            </Button>
            <Button
              size="sm"
              accent="danger"
              loading={deleting}
              onClick={confirmDelete}
            >
              {t("portal.pipelines.delete.confirm")}
            </Button>
          </div>
        }
      >
        <p>{t("portal.pipelines.delete.body", { name: name || "" })}</p>
      </Modal>

      <Modal
        open={pendingNav !== null}
        onClose={() => !submitting && setPendingNav(null)}
        width="sm"
        title={t("portal.pipelines.builder.unsavedTitle")}
        footer={
          <div className="portal-pipelines__composer-footer">
            <Button
              variant="tertiary"
              size="sm"
              disabled={submitting}
              onClick={() => setPendingNav(null)}
            >
              {t("portal.pipelines.builder.keepEditing")}
            </Button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                variant="secondary"
                size="sm"
                accent="danger"
                disabled={submitting}
                onClick={() => {
                  const target = pendingNav;
                  setPendingNav(null);
                  if (target) navigate(target);
                }}
              >
                {t("portal.pipelines.builder.discard")}
              </Button>
              <Button
                size="sm"
                loading={submitting}
                disabled={!canSave}
                onClick={() => {
                  const target = pendingNav;
                  setPendingNav(null);
                  if (target) void save(target);
                }}
              >
                {t("portal.pipelines.composer.save")}
              </Button>
            </div>
          </div>
        }
      >
        <p>{t("portal.pipelines.builder.unsavedBody")}</p>
      </Modal>

      <Modal
        open={s3ConfigOpen}
        onClose={() => setS3ConfigOpen(false)}
        title={t("portal.pipelines.composer.s3ModalTitle")}
        footer={
          <div className="portal-pipelines__composer-footer">
            <Button size="sm" onClick={() => setS3ConfigOpen(false)}>
              {t("portal.pipelines.composer.s3Done")}
            </Button>
          </div>
        }
      >
        <div className="portal-builder__s3-fields">
          <FormField
            label={t("portal.sources.types.s3.fields.bucket.label")}
            required
          >
            <Input
              value={outputS3.bucket}
              placeholder="my-company-inbox"
              onChange={(e) => setS3Field("bucket", e.target.value)}
            />
          </FormField>
          <FormField label={t("portal.sources.types.s3.fields.region.label")}>
            <Input
              value={outputS3.region}
              placeholder="us-east-1"
              onChange={(e) => setS3Field("region", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("portal.sources.types.s3.fields.prefix.label")}
            helperText={t("portal.pipelines.composer.s3PrefixHelp")}
          >
            <Input
              value={outputS3.prefix}
              placeholder="processed/"
              onChange={(e) => setS3Field("prefix", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("portal.sources.types.s3.fields.accessKeyId.label")}
            helperText={t(
              "portal.sources.types.s3.fields.accessKeyId.helperText",
            )}
          >
            <Input
              value={outputS3.accessKeyId}
              onChange={(e) => setS3Field("accessKeyId", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("portal.sources.types.s3.fields.secretAccessKey.label")}
          >
            <Input
              type="password"
              value={outputS3.secretAccessKey}
              onChange={(e) => setS3Field("secretAccessKey", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("portal.sources.types.s3.fields.endpoint.label")}
            helperText={t("portal.sources.types.s3.fields.endpoint.helperText")}
          >
            <Input
              value={outputS3.endpoint}
              placeholder="https://s3.example.com"
              onChange={(e) => setS3Field("endpoint", e.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
