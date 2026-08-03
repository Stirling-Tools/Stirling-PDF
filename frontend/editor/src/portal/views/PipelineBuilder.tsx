import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  ActionIcon,
  Banner,
  Button,
  FormField,
  Input,
  Modal,
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
  stepNeedsConfiguring,
  stepRequiresUpload,
  type ExecutableTool,
  type WorkingToolStep,
} from "@app/hooks/tools/shared/toolAutomation";
import {
  getToolFormatLabel,
  getToolFormatListLabel,
} from "@app/utils/toolIOLabels";
import {
  chainOutputFormat,
  diagnosticsForStep,
  hasBlockingDiagnostics,
  validateToolChain,
  type ToolDiagnostic,
} from "@app/utils/toolIOCompat";
import { errorMessage } from "@portal/api/http";
import {
  deletePipeline,
  fetchPipeline,
  fetchRun,
  fetchRunOutput,
  fetchTriggers,
  runPipelineTest,
  savePipeline,
  triggerPipeline,
  type Policy,
  type PolicyRunView,
  type RunOutputFile,
  type TriggerConfig,
  type TriggerInfo,
  type TriggerOutcome,
} from "@portal/api/pipelines";
import { clearProcessedHistory } from "@portal/api/policies";
import { DestinationPicker } from "@portal/components/pipelines/DestinationPicker";
import { availableOutputModes } from "@portal/components/pipelines/outputModes";
import { type SourceView } from "@portal/api/sources";
import { useSources } from "@portal/queries/sources";
import { SourceModal } from "@portal/components/sources/SourceModal";
import { EDITOR_SOURCE_TYPE } from "@portal/components/sources/sourceTypes";
import { useAsync } from "@portal/hooks/useAsync";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { humanizeOperation } from "@portal/components/pipelines/pipelineOperations";
import { PipelineHeader } from "@portal/components/pipelines/PipelineHeader";
import { PipelineInspector } from "@portal/components/pipelines/PipelineInspector";
import { PipelineDefinitionModal } from "@portal/components/pipelines/PipelineDefinitionModal";
import {
  PipelineGraph,
  selectedSteps,
  type ChainEnd,
  type GraphSelection,
  type GraphStepContent,
} from "@portal/components/pipelines/graph/PipelineGraph";
import { PipelineStepSettings } from "@portal/components/pipelines/PipelineStepSettings";
import { ToolPicker } from "@portal/components/pipelines/ToolPicker";
import { STEP_OPERATIONS } from "@portal/components/policies/stepOperations";
import {
  integrationStepConfigured,
  isIntegrationStep,
  newIntegrationStep,
  stepOperation,
} from "@portal/components/pipelines/integrationStep";
import "@portal/views/PipelineBuilder.css";

type ScheduleUnit = "MINUTES" | "HOURS" | "DAYS";

const SCHEDULE_UNITS: ScheduleUnit[] = ["MINUTES", "HOURS", "DAYS"];
/** Empty trigger type = manual-only (no automatic trigger). */
const MANUAL = "";
/**
 * Sentinel value for the manual choice in the trigger dropdown. Mantine's Select treats an empty
 * string as "no selection" (it shows the placeholder, not the option), so the manual option needs a
 * real value; it maps to/from the empty {@link MANUAL} trigger type at the edges.
 */
const MANUAL_OPTION = "manual";

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

/** One input row in the builder: a source paired with its own trigger config. */
interface WorkingInput {
  sourceId: string;
  triggerType: string;
  scheduleCount: string;
  scheduleUnit: ScheduleUnit;
}

/** The input row with nothing chosen yet: no source, manual trigger. */
function blankInput(): WorkingInput {
  return {
    sourceId: "",
    triggerType: MANUAL,
    scheduleCount: "1",
    scheduleUnit: "HOURS",
  };
}

/** The trigger config for the input row, or null for a manual (on-demand) input. */
function buildTriggerFor(input: WorkingInput): TriggerConfig | null {
  if (input.triggerType === MANUAL) return null;
  if (input.triggerType === "schedule") {
    return {
      type: "schedule",
      options: {
        schedule: {
          type: "every",
          count: Number(input.scheduleCount),
          unit: input.scheduleUnit,
        },
      },
    };
  }
  return { type: input.triggerType, options: {} };
}

/** Whether a source can be written to, i.e. offered as a pipeline destination. */
function isWritableSource(source: SourceView): boolean {
  return (availableOutputModes() as string[]).includes(source.type);
}

/**
 * Full-page pipeline builder (route: /pipelines/new and /pipelines/:id). Pipeline-level settings
 * (sources, trigger, output) sit above the operation list; the operation list and the selected
 * tool's settings sit side by side below. For an existing pipeline the header also runs and
 * deletes it. Replaces the former modal composer and the list's inline detail card.
 */
export function PipelineBuilder() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Pipelines are stored as policies, so a save/delete must invalidate both the
  // pipelines overview and the policies caches (Policies page + Home) before
  // navigating back to the list.
  const invalidatePipelines = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.pipelines() }),
      queryClient.invalidateQueries({ queryKey: qk.policiesList() }),
      queryClient.invalidateQueries({ queryKey: qk.policyRuns() }),
    ]);
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
  const sourcesState = useSources();
  const triggersState = useAsync<TriggerInfo[]>(
    async () => await fetchTriggers(),
    [],
  );
  // The editor is a built-in, client-driven source (it runs on editor upload,
  // not as a pipeline input), so it's excluded from a pipeline's inputs.
  const availableSources = useMemo<SourceView[]>(
    () =>
      (sourcesState.data?.sources ?? []).filter(
        (source) => source.type !== EDITOR_SOURCE_TYPE,
      ),
    [sourcesState.data],
  );
  // A destination is a source used as a write target: only writable types (folder/S3, filtered per
  // deployment) can be picked, and the virtual editor is already excluded from availableSources.
  const writableSources = useMemo<SourceView[]>(
    () => availableSources.filter(isWritableSource),
    [availableSources],
  );
  const triggers = useMemo(
    () => triggersState.data ?? [],
    [triggersState.data],
  );

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  // Exactly one input: the row is always present, so the working state is a single object; the
  // wire shape stays a list (see save()).
  const [input, setInput] = useState<WorkingInput>(blankInput);
  const [steps, setSteps] = useState<WorkingToolStep[]>([]);
  /** Which node the inspector is editing: an end of the chain, a step, or nothing. */
  const [selected, setSelected] = useState<GraphSelection>(null);
  /** Slot the tool picker will insert into, or null when it is closed. */
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [definitionOpen, setDefinitionOpen] = useState(false);
  /** The last test run in this session: one file through the steps as they stand. */
  const [testRun, setTestRun] = useState<PolicyRunView | null>(null);
  const [testing, setTesting] = useState(false);
  const [outputIds, setOutputIds] = useState<string[]>([]);
  /**
   * Whether the user has asked for each end of the chain yet, distinguishing "not offered" from
   * "offered and still owed a choice" - the two states an empty sourceId cannot tell apart. Only a
   * brand new pipeline starts with either false; anything loaded arrives with both ends set, and
   * choosing one places it, so these are just the "clicked add, chosen nothing" window.
   */
  const [inputAsked, setInputAsked] = useState(false);
  const [outputAsked, setOutputAsked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [running, setRunning] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  // Create or edit a source in place, instead of leaving the builder (and its
  // unsaved edits) for the Sources page.
  const [sourceModal, setSourceModal] = useState<{
    open: boolean;
    sourceId: string | null;
  }>({ open: false, sourceId: null });
  // A source created from here is the one the pipeline was missing, so select it
  // on arrival - as the input or the destination, whichever asked for it.
  const autoSelectRef = useRef<"input" | "output" | null>(null);
  const knownSourceIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const target = autoSelectRef.current;
    const known = knownSourceIdsRef.current;
    knownSourceIdsRef.current = new Set(availableSources.map((s) => s.id));
    if (!target) return;
    const fresh = availableSources.find((s) => !known.has(s.id));
    if (!fresh) return;
    // One arrival answers the request, whatever type it turned out to be.
    autoSelectRef.current = null;
    if (target === "input") {
      changeInputSource(fresh.id);
    } else if (isWritableSource(fresh)) {
      // A source of an unwritable type is left alone rather than becoming a
      // destination the picker has no option for.
      setOutputIds([fresh.id]);
    }
  }, [availableSources]);

  function createSourceFor(target: "input" | "output") {
    autoSelectRef.current = target;
    setSourceModal({ open: true, sourceId: null });
  }

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
    setName(policy?.name ?? "");
    setEnabled(policy?.enabled ?? true);
    // The one input row is always present: blank for a new pipeline (or a legacy policy saved
    // without inputs), the stored input for an edit. A legacy multi-input policy shows only its
    // first input; saving persists just that one (the backend rejects more anyway).
    const stored = policy?.inputs[0];
    if (stored) {
      const trigger = parseTrigger(stored.trigger);
      setInput({
        sourceId: stored.sourceId,
        triggerType: trigger.triggerType,
        scheduleCount: trigger.count,
        scheduleUnit: trigger.unit,
      });
    } else {
      setInput(blankInput());
    }
    setSteps(
      (policy?.steps ?? []).map((step) => deserializeToolStep(step, allTools)),
    );
    setOutputIds(policy?.outputIds ?? []);
    setSeeded(true);
  }, [isEdit, policyState.data, allTools, seeded]);

  const sourceType = (sourceId: string) =>
    availableSources.find((s) => s.id === sourceId)?.type;

  // A trigger fits a source when it needs no source, or the source's type is one it supports
  // (folder-watch → folder; schedule → any). Drives the per-input trigger dropdown.
  const triggerFitsType = (trigger: TriggerInfo, type: string) =>
    !trigger.requiresSource || trigger.supportedSourceTypes.includes(type);

  const sourceOptions = availableSources.map((source) => ({
    value: source.id,
    label: source.name,
  }));

  // Manual plus every trigger compatible with this row's source. Manual only until a source is set.
  function triggerOptionsFor(sourceId: string) {
    const options = [
      {
        value: MANUAL_OPTION,
        label: t("portal.pipelines.composer.triggerManual"),
      },
    ];
    const type = sourceType(sourceId);
    if (type) {
      for (const trigger of triggers) {
        if (triggerFitsType(trigger, type)) {
          options.push({
            value: trigger.type,
            label: t(`portal.pipelines.trigger.${trigger.type}`, {
              defaultValue: trigger.type,
            }),
          });
        }
      }
    }
    return options;
  }

  function updateInput(patch: Partial<WorkingInput>) {
    setInput((current) => ({ ...current, ...patch }));
  }

  // Changing the source may make the current trigger incompatible (folder-watch on a non-folder);
  // drop it back to manual when that happens so the row can't hold an invalid pairing.
  function changeInputSource(sourceId: string) {
    setInput((current) => {
      const type = sourceType(sourceId);
      const trigger = triggers.find((tr) => tr.type === current.triggerType);
      const keepTrigger =
        current.triggerType === MANUAL ||
        (type != null && trigger != null && triggerFitsType(trigger, type));
      return {
        ...current,
        sourceId,
        triggerType: keepTrigger ? current.triggerType : MANUAL,
      };
    });
  }

  /** Put an end on the chain and open it, so the click that asks for it also offers the choice. */
  function addEnd(end: ChainEnd) {
    if (end === "input") setInputAsked(true);
    else setOutputAsked(true);
    setSelected(end);
  }

  /** Take an end back off, discarding whatever it held so its row reads as unfilled again. */
  function removeEnd(end: ChainEnd) {
    if (end === "input") {
      setInputAsked(false);
      setInput(blankInput());
    } else {
      setOutputAsked(false);
      setOutputIds([]);
    }
    setSelected((current) => (current === end ? null : current));
  }

  /** Drop a new step into the slot the picker was opened on, and select it to be configured. */
  function insertStep(step: WorkingToolStep) {
    const at = pickerAt ?? steps.length;
    setSteps((current) => {
      const next = [...current];
      next.splice(at, 0, step);
      return next;
    });
    setSelected({ steps: [at] });
    setPickerAt(null);
  }

  function addOperationStep(op: (typeof STEP_OPERATIONS)[number]) {
    insertStep(newIntegrationStep(op));
  }

  function addStep(tool: ExecutableTool) {
    insertStep(newWorkingToolStep(tool, allTools));
  }

  function removeSteps(indices: number[]) {
    const gone = new Set(indices);
    setSelected(null);
    setSteps((current) => current.filter((_, i) => !gone.has(i)));
  }

  /**
   * Apply a reordered chain, given as the original step indices in their new positions. The moved
   * steps stay selected where they land, so a set can be dragged again without re-picking it.
   */
  function reorderSteps(order: number[]) {
    const moving = new Set(selectedSteps(selected));
    setSteps((current) => order.map((i) => current[i]));
    const landed = order
      .map((original, position) => ({ original, position }))
      .filter(({ original }) => moving.has(original))
      .map(({ position }) => position);
    setSelected(landed.length > 0 ? { steps: landed } : null);
  }

  function updateStepParams(index: number, params: ErasedToolParams) {
    setSteps((current) =>
      current.map((step, i) =>
        // Integration steps are deliberately toolId-less, so they must be editable too; only a
        // genuinely unrecognised step has no editor to send changes from.
        i === index && (step.toolId !== null || isIntegrationStep(step))
          ? { ...step, params }
          : step,
      ),
    );
  }

  function stepLabel(step: WorkingToolStep): string {
    // An integration step's endpoint is the same for every vendor, so the raw path would read
    // "External api call" for all of them. Name it by the operation instead.
    const op = stepOperation(step);
    if (op) return t(op.labelKey);
    if (isIntegrationStep(step))
      return t("portal.pipelines.builder.sendToSystem");
    const entry = step.toolId ? allTools[step.toolId] : undefined;
    return entry?.name ?? humanizeOperation(step.operation);
  }

  // Steps whose params carry an uploaded file can't be saved: the bytes aren't persisted with the
  // policy, so a later run would send null for that field (see stepRequiresUpload).
  const uploadStepLabels = steps.filter(stepRequiresUpload).map(stepLabel);
  const hasUploadSteps = uploadStepLabels.length > 0;

  // A step still missing a choice - an integration with no operation or account, a tool whose
  // mandatory parameters are unset - would fail at run time with a raw backend rejection, so block
  // saving on it here where the fix is one click away.
  const unconfiguredStepLabels = steps
    .filter(
      (step) =>
        !integrationStepConfigured(step) ||
        stepNeedsConfiguring(step, allTools),
    )
    .map(stepLabel);
  const hasUnconfiguredSteps = unconfiguredStepLabels.length > 0;

  // Whether each step can actually accept what the one before it produces. Checked here from the
  // generated tool I/O table rather than by running the pipeline, so an impossible chain (say,
  // Extract Images then Rotate) is caught while it is being built.
  const chainDiagnostics = useMemo(
    () =>
      validateToolChain(
        steps.map((step) => ({
          operation: step.operation,
          parameters: step.params,
        })),
      ),
    [steps],
  );
  const blockingSteps = chainDiagnostics
    .filter((d) => d.severity === "ERROR")
    .map((d) => stepLabel(steps[d.stepIndex]));
  const hasIncompatibleSteps = hasBlockingDiagnostics(chainDiagnostics);

  // What a newly added step would be handed, so the picker can flag tools that cannot take it.
  const chainOutput = useMemo(
    () =>
      chainOutputFormat(
        steps.map((step) => ({
          operation: step.operation,
          parameters: step.params,
        })),
      ),
    [steps],
  );

  function diagnosticNote(diagnostic: ToolDiagnostic): string {
    const { accepts, produced } = diagnostic.detail;
    return t(`portal.pipelines.builder.diagnostic.${diagnostic.code}`, {
      accepts: getToolFormatListLabel(t, i18n.language, accepts ?? []),
      produced: produced ? getToolFormatLabel(t, produced) : "",
    });
  }

  /** The most severe diagnostic for a step, rendered as its note. */
  function renderStepDiagnostic(index: number) {
    const forStep = diagnosticsForStep(chainDiagnostics, index);
    const diagnostic =
      forStep.find((d) => d.severity === "ERROR") ??
      forStep.find((d) => d.severity === "WARN") ??
      forStep[0];
    if (!diagnostic) return null;
    return (
      <span
        className={
          "portal-builder__step-note" +
          (diagnostic.severity === "ERROR"
            ? " portal-builder__step-note--danger"
            : "")
        }
      >
        {diagnosticNote(diagnostic)}
      </span>
    );
  }

  // Track unsaved edits: snapshot the form and compare against the state captured just after
  // seeding, so leaving the builder can prompt to save or discard.
  const snapshot = JSON.stringify({
    name: name.trim(),
    enabled,
    input,
    steps: steps.map((step) => serializeToolStep(step, allTools)),
    uploads: steps.map(stepRequiresUpload),
    outputIds: [...outputIds].sort(),
  });
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    if (seeded && baseline.current === null) baseline.current = snapshot;
  }, [seeded, snapshot]);
  const dirty = baseline.current !== null && baseline.current !== snapshot;

  // The input needs a source, and a scheduled input needs a positive interval; the pipeline
  // needs exactly one output destination.
  const inputValid =
    input.sourceId !== "" &&
    (input.triggerType !== "schedule" || Number(input.scheduleCount) > 0);
  const outputValid = outputIds.length === 1;
  const canSave =
    name.trim() !== "" &&
    inputValid &&
    outputValid &&
    !hasUploadSteps &&
    !hasUnconfiguredSteps &&
    !hasIncompatibleSteps &&
    !submitting;

  const listPath = toPortalPath(VIEW_PATHS.pipelines);

  function close() {
    navigate(listPath);
  }

  // Leave the builder, but prompt first if there are unsaved edits (see the unsaved-changes modal).
  function attemptLeave(destination: string) {
    if (dirty) setPendingNav(destination);
    else navigate(destination);
  }

  async function save(destination: string) {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    const policy: Policy = {
      id: policyState.data?.id ?? undefined,
      name: name.trim(),
      enabled,
      // The wire shape stays a list; canSave guarantees the one input has a source.
      inputs: [{ sourceId: input.sourceId, trigger: buildTriggerFor(input) }],
      steps: steps.map((step) => serializeToolStep(step, allTools)),
      // Destinations are the referenced saved sources; the inline output field is
      // preserved as-is (e.g. an editor policy's membership metadata) or defaults to inline.
      output: policyState.data?.output ?? { type: "inline", options: {} },
      outputIds,
    };
    try {
      await savePipeline(policy);
      await invalidatePipelines();
      navigate(destination);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  // Poll a run until it reaches a terminal state (or we give up), so a failure surfaces.
  async function awaitRun(
    runId: string,
    onProgress?: (view: PolicyRunView) => void,
  ): Promise<PolicyRunView | null> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      if (!mounted.current) return null;
      const view = await fetchRun(runId);
      onProgress?.(view);
      if (TERMINAL_STATUSES.has(view.status)) return view;
      await sleep(POLL_INTERVAL_MS);
    }
    return null;
  }

  /**
   * Run the steps as they stand against one uploaded file. Output is forced inline so nothing
   * reaches the pipeline's real destination, and the pipeline need not be saved first - this is
   * how the chain gets checked while it is still being built.
   */
  async function handleTest(file: File) {
    if (testing) return;
    setTesting(true);
    setTestRun(null);
    setRunResult(null);
    try {
      const { runId } = await runPipelineTest(
        {
          name: name.trim() || t("portal.pipelines.builder.testRun"),
          steps: steps.map((step) => serializeToolStep(step, allTools)),
          output: { type: "inline", options: {} },
        },
        file,
      );
      const final = await awaitRun(runId, (view) => {
        if (mounted.current) setTestRun(view);
      });
      if (mounted.current && final) setTestRun(final);
    } catch (e) {
      if (mounted.current)
        setRunResult({ tone: "danger", text: errorMessage(e) });
    } finally {
      if (mounted.current) setTesting(false);
    }
  }

  /** Save one of a test run's outputs to disk. */
  async function downloadOutput(output: RunOutputFile) {
    try {
      const blob = await fetchRunOutput(output.fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = output.fileName ?? output.fileId;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (mounted.current)
        setRunResult({ tone: "danger", text: errorMessage(e) });
    }
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
      await invalidatePipelines();
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

  const chosenSteps = selectedSteps(selected);
  // One step selected means its settings; several means there is no single thing to configure.
  const selectedStep =
    chosenSteps.length === 1 ? (steps[chosenSteps[0]] ?? null) : null;

  const chosenSource = availableSources.find((s) => s.id === input.sourceId);
  const chosenDestination = writableSources.find((s) => s.id === outputIds[0]);

  /** How this input fires, in a few words, for the input node's summary line. */
  function triggerSummary(): string {
    if (input.triggerType === MANUAL)
      return t("portal.pipelines.composer.triggerManual");
    if (input.triggerType === "schedule")
      return `${t("portal.pipelines.composer.scheduleEvery")} ${input.scheduleCount} ${t(
        `portal.pipelines.composer.unit.${input.scheduleUnit.toLowerCase()}`,
      )}`;
    return t(`portal.pipelines.trigger.${input.triggerType}`, {
      defaultValue: input.triggerType,
    });
  }

  /** Why a step cannot be saved yet, if anything. */
  function stepWarning(step: WorkingToolStep): string | undefined {
    if (isIntegrationStep(step)) {
      if (!stepOperation(step))
        return t("portal.pipelines.builder.chooseOperation");
      if (!integrationStepConfigured(step))
        return t("portal.pipelines.builder.chooseAccount");
      return undefined;
    }
    if (stepRequiresUpload(step))
      return t("portal.pipelines.builder.needsUpload");
    if (stepNeedsConfiguring(step, allTools))
      return t("portal.pipelines.builder.needsConfiguring");
    return undefined;
  }

  /** A step's one-line summary: what it will do beyond its name. */
  function stepDetail(step: WorkingToolStep): string | undefined {
    if (step.support === "unsupported")
      return t("portal.pipelines.builder.usesDefaults");
    if (step.support === "unknown")
      return t("portal.pipelines.builder.unknownStep");
    return undefined;
  }

  // A run reports one step cursor, so progress reads off it: everything before the cursor is done,
  // the cursor itself is whatever the run currently is.
  function stepRunState(index: number): GraphStepContent["runState"] {
    if (!testRun) return undefined;
    if (index < testRun.currentStep) return "done";
    if (index > testRun.currentStep) return undefined;
    if (testRun.status === "FAILED") return "failed";
    if (testRun.status === "COMPLETED") return "done";
    return "running";
  }

  const graphSteps: GraphStepContent[] = steps.map((step, i) => ({
    label: stepLabel(step),
    detail: stepDetail(step),
    warning: stepWarning(step),
    runState: stepRunState(i),
  }));

  const definitionJson = JSON.stringify(
    {
      name: name.trim(),
      enabled,
      inputs: [{ sourceId: input.sourceId, trigger: buildTriggerFor(input) }],
      steps: steps.map((step) => serializeToolStep(step, allTools)),
      outputIds,
    },
    null,
    2,
  );

  const testSummary =
    testRun === null
      ? null
      : {
          status:
            testRun.status === "FAILED"
              ? ("failed" as const)
              : testRun.status === "COMPLETED"
                ? ("completed" as const)
                : ("running" as const),
          completedSteps: testRun.currentStep,
          stepCount: testRun.stepCount,
          error: testRun.error,
          outputs: testRun.outputs ?? [],
        };

  /** The editor for whatever node is selected. Undefined when nothing is. */
  function inspectorBody() {
    if (selected === "input") {
      return (
        <>
          <FormField label={t("portal.pipelines.builder.inputSource")}>
            <div className="portal-builder__input-row">
              <div className="portal-builder__input-field">
                <Select
                  inputSize="sm"
                  aria-label={t("portal.pipelines.builder.inputSource")}
                  placeholder={t("portal.pipelines.builder.chooseSource")}
                  value={input.sourceId || null}
                  invalid={input.sourceId === ""}
                  onChange={(value) => changeInputSource(value ?? "")}
                  options={sourceOptions}
                />
              </div>
              <ActionIcon
                variant="tertiary"
                className="portal-builder__source-edit"
                aria-label={t("portal.pipelines.composer.editSource")}
                disabled={input.sourceId === ""}
                onClick={() =>
                  setSourceModal({ open: true, sourceId: input.sourceId })
                }
              >
                <EditOutlinedIcon style={{ fontSize: "1rem" }} />
              </ActionIcon>
            </div>
          </FormField>

          <FormField label={t("portal.pipelines.builder.inputTrigger")}>
            <Select
              inputSize="sm"
              aria-label={t("portal.pipelines.builder.inputTrigger")}
              value={
                input.triggerType === MANUAL ? MANUAL_OPTION : input.triggerType
              }
              disabled={input.sourceId === ""}
              onChange={(value) =>
                updateInput({
                  triggerType:
                    value && value !== MANUAL_OPTION ? value : MANUAL,
                })
              }
              options={triggerOptionsFor(input.sourceId)}
            />
          </FormField>

          {input.triggerType === "schedule" && (
            <div className="portal-pipelines__schedule">
              <span className="portal-pipelines__muted">
                {t("portal.pipelines.composer.scheduleEvery")}
              </span>
              <Input
                inputSize="sm"
                type="number"
                min={1}
                value={input.scheduleCount}
                invalid={Number(input.scheduleCount) <= 0}
                onChange={(e) => updateInput({ scheduleCount: e.target.value })}
                className="portal-pipelines__schedule-count"
              />
              <Select
                inputSize="sm"
                value={input.scheduleUnit}
                onChange={(value) =>
                  value && updateInput({ scheduleUnit: value as ScheduleUnit })
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

          <Button
            variant="tertiary"
            size="sm"
            onClick={() => createSourceFor("input")}
            leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
          >
            {t("portal.sources.actions.connectSource")}
          </Button>

          {availableSources.length === 0 && (
            <p className="portal-pipelines__muted">
              {t("portal.pipelines.builder.noSources")}
            </p>
          )}
        </>
      );
    }

    if (selected === "output") {
      return (
        <DestinationPicker
          sources={writableSources}
          value={outputIds}
          onChange={setOutputIds}
          onCreateNew={() => createSourceFor("output")}
          onEdit={(sourceId) => setSourceModal({ open: true, sourceId })}
        />
      );
    }

    if (selectedStep) {
      return (
        <PipelineStepSettings
          step={selectedStep}
          registry={allTools}
          onChange={(params) => updateStepParams(chosenSteps[0], params)}
        />
      );
    }

    return undefined;
  }

  return (
    <div className="portal-builder">
      <PipelineHeader
        name={name}
        onNameChange={setName}
        enabled={enabled}
        onEnabledChange={setEnabled}
        isEdit={isEdit}
        canSave={canSave}
        saving={submitting}
        onSave={() => save(listPath)}
        onCancel={() => attemptLeave(listPath)}
        onBack={() => attemptLeave(listPath)}
        onTest={handleTest}
        testing={testing}
        onRun={handleRun}
        running={running}
        onClearHistory={handleClearHistory}
        clearingHistory={clearingHistory}
        onDelete={() => setPendingDelete(true)}
        onViewDefinition={() => setDefinitionOpen(true)}
        runResult={testSummary}
        onDownloadOutput={downloadOutput}
      />

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
      {hasUnconfiguredSteps && (
        <Banner
          tone="warning"
          description={t("portal.pipelines.builder.stepsNeedSetup", {
            tools: unconfiguredStepLabels.join(", "),
          })}
        />
      )}
      {hasIncompatibleSteps && (
        <Banner
          tone="danger"
          description={t("portal.pipelines.builder.stepsIncompatible", {
            tools: blockingSteps.join(", "),
          })}
        />
      )}

      <div className="portal-builder__grid">
        <PipelineGraph
          // An end is on the chain once it has been asked for or already holds a value, so a
          // loaded pipeline needs no seeding: its source and destination place themselves.
          input={
            inputAsked || inputValid
              ? {
                  label:
                    chosenSource?.name ??
                    t("portal.pipelines.builder.chooseSource"),
                  detail: chosenSource ? triggerSummary() : undefined,
                  warning: inputValid
                    ? undefined
                    : t("portal.pipelines.builder.needsSource"),
                }
              : null
          }
          output={
            outputAsked || outputValid
              ? {
                  label:
                    chosenDestination?.name ??
                    t("portal.pipelines.builder.chooseDestination"),
                  warning: outputValid
                    ? undefined
                    : t("portal.pipelines.builder.needsDestination"),
                }
              : null
          }
          steps={graphSteps}
          selected={selected}
          onSelect={setSelected}
          onAddEnd={addEnd}
          onRemoveEnd={removeEnd}
          onInsertStep={setPickerAt}
          onRemoveSteps={removeSteps}
          onReorderSteps={reorderSteps}
          onOpenStepError={(index) => setSelected({ steps: [index] })}
        />

        <PipelineInspector
          title={
            selected === "input"
              ? t("portal.pipelines.builder.inputs")
              : selected === "output"
                ? t("portal.pipelines.composer.output")
                : selectedStep
                  ? stepLabel(selectedStep)
                  : undefined
          }
          error={
            chosenSteps.length === 1 &&
            testRun?.status === "FAILED" &&
            testRun.currentStep === chosenSteps[0]
              ? testRun.error
              : undefined
          }
          message={
            chosenSteps.length > 1
              ? t("portal.pipelines.inspector.multipleSelected", {
                  count: chosenSteps.length,
                })
              : undefined
          }
        >
          {inspectorBody()}
        </PipelineInspector>
      </div>

      <Modal
        open={pickerAt !== null}
        onClose={() => setPickerAt(null)}
        width="md"
        title={t("portal.pipelines.composer.addTool")}
        className="portal-pipelines__picker-modal"
      >
        <ToolPicker
          tools={executableTools}
          onPick={addStep}
          operations={STEP_OPERATIONS}
          onPickOperation={addOperationStep}
          onClose={() => setPickerAt(null)}
        />
      </Modal>

      <PipelineDefinitionModal
        open={definitionOpen}
        onClose={() => setDefinitionOpen(false)}
        json={definitionJson}
      />

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

      <SourceModal
        open={sourceModal.open}
        sourceId={sourceModal.sourceId}
        onClose={() => setSourceModal({ open: false, sourceId: null })}
      />
    </div>
  );
}
