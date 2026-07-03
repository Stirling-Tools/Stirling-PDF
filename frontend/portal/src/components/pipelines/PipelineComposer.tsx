import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Checkbox,
  Chip,
  FormField,
  Input,
  Modal,
  RadioGroup,
  Select,
} from "@shared/components";
import { errorMessage } from "@portal/api/http";
import {
  fetchTriggers,
  savePipeline,
  type OutputSpec,
  type PipelineStep,
  type Policy,
  type TriggerConfig,
  type TriggerInfo,
} from "@portal/api/pipelines";
import { fetchSources, type SourceView } from "@portal/api/sources";
import { useAsync } from "@portal/hooks/useAsync";
import {
  PIPELINE_OPERATIONS,
  humanizeOperation,
} from "@portal/components/pipelines/pipelineOperations";
import "@portal/views/Pipelines.css";

type OutputMode = "inline" | "folder";
type ScheduleUnit = "MINUTES" | "HOURS" | "DAYS";

const SCHEDULE_UNITS: ScheduleUnit[] = ["MINUTES", "HOURS", "DAYS"];
/** Empty trigger type = manual-only (no automatic trigger). */
const MANUAL = "";

interface PipelineComposerProps {
  open: boolean;
  onClose: () => void;
  /** Called after a pipeline is created or updated so the page can refetch. */
  onSaved: () => void;
  /** When set, the composer edits this existing policy instead of creating one. */
  pipeline?: Policy;
}

/**
 * A policy's trigger parsed into the composer's fields: which trigger type (empty
 * = manual), and the schedule interval when it's a schedule trigger.
 */
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
    // Non-interval schedules (daily/weekly/monthly) aren't editable here; show
    // the schedule choice with defaults the user can re-set.
    return { triggerType: "schedule", count: "1", unit: "HOURS" };
  }
  return { triggerType: trigger.type, count: "1", unit: "HOURS" };
}

/** Output sink fields parsed from a policy's output for editing. */
function parseOutput(output: OutputSpec | undefined): {
  mode: OutputMode;
  directory: string;
} {
  if (output?.type === "folder") {
    return {
      mode: "folder",
      directory: String(output.options?.directory ?? ""),
    };
  }
  return { mode: "inline", directory: "" };
}

/**
 * Compose a pipeline (a backend policy): name it, pick the sources it pulls from
 * and how it's triggered, chain operations, and choose where output goes. On submit
 * a blank id creates and a set id updates, matching the backend's POST contract.
 * Per-operation parameter editing is out of scope here; operations are chained with
 * their defaults.
 */
export function PipelineComposer({
  open,
  onClose,
  onSaved,
  pipeline,
}: PipelineComposerProps) {
  const { t } = useTranslation();
  const isEdit = pipeline !== undefined;

  const sourcesState = useAsync<SourceView[]>(
    async () => (open ? (await fetchSources()).sources : []),
    [open],
  );
  const availableSources = sourcesState.data ?? [];

  // The triggers the backend supports, with their source-type compatibility, so
  // the UI offers them (and pairs them with sources) without hard-coding the set.
  const triggersState = useAsync<TriggerInfo[]>(
    async () => (open ? await fetchTriggers() : []),
    [open],
  );
  const triggers = useMemo(
    () => triggersState.data ?? [],
    [triggersState.data],
  );

  const [name, setName] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [triggerType, setTriggerType] = useState<string>(MANUAL);
  const [scheduleCount, setScheduleCount] = useState("1");
  const [scheduleUnit, setScheduleUnit] = useState<ScheduleUnit>("HOURS");
  const [outputMode, setOutputMode] = useState<OutputMode>("inline");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the composer opens (or its target changes) so editing
  // prefills the current config and a reopened create starts clean.
  useEffect(() => {
    if (!open) return;
    const trigger = parseTrigger(pipeline?.trigger ?? null);
    const output = parseOutput(pipeline?.output);
    setName(pipeline?.name ?? "");
    setSourceIds(pipeline?.sourceIds ?? []);
    setSteps(pipeline?.steps ?? []);
    setTriggerType(trigger.triggerType);
    setScheduleCount(trigger.count);
    setScheduleUnit(trigger.unit);
    setOutputMode(output.mode);
    setOutputDirectory(output.directory);
    setSubmitting(false);
    setError(null);
  }, [open, pipeline]);

  // Types of the currently-selected sources, for trigger compatibility.
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

  // A source-requiring trigger stops being valid the moment its compatible source
  // is deselected; fall back to manual so we never submit an impossible trigger.
  useEffect(() => {
    if (triggerType === MANUAL) return;
    const selected = triggers.find((trigger) => trigger.type === triggerType);
    if (selected && !triggerAvailable(selected)) setTriggerType(MANUAL);
  }, [triggerType, triggers, triggerAvailable]);

  function toggleSource(id: string, checked: boolean) {
    setSourceIds((ids) =>
      checked ? [...ids, id] : ids.filter((existing) => existing !== id),
    );
  }

  function addStep(operation: string, parameters: Record<string, unknown>) {
    setSteps((current) => [
      ...current,
      { operation, parameters: { ...parameters } },
    ]);
  }

  function removeStep(index: number) {
    setSteps((current) => current.filter((_, i) => i !== index));
  }

  function moveStep(index: number, delta: number) {
    setSteps((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const scheduleCountValid =
    triggerType !== "schedule" || Number(scheduleCount) > 0;
  const outputValid = outputMode !== "folder" || outputDirectory.trim() !== "";
  const canSave =
    name.trim() !== "" && scheduleCountValid && outputValid && !submitting;

  const triggerOptions = [
    { value: MANUAL, label: t("pipelines.composer.triggerManual") },
    ...triggers.map((trigger) => ({
      value: trigger.type,
      label: t(`pipelines.trigger.${trigger.type}`, {
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

  async function submit() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    const output: OutputSpec =
      outputMode === "folder"
        ? { type: "folder", options: { directory: outputDirectory.trim() } }
        : { type: "inline", options: {} };
    const policy: Policy = {
      id: pipeline?.id,
      name: name.trim(),
      enabled: pipeline?.enabled ?? true,
      trigger: buildTrigger(),
      sourceIds,
      steps,
      output,
    };
    try {
      await savePipeline(policy);
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={
        isEdit
          ? t("pipelines.composer.editTitle")
          : t("pipelines.composer.title")
      }
      subtitle={t("pipelines.composer.subtitle")}
      footer={
        <div className="portal-pipelines__composer-footer">
          <Button
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={onClose}
          >
            {t("pipelines.composer.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={submit}
            loading={submitting}
            disabled={!canSave}
          >
            {isEdit
              ? t("pipelines.composer.save")
              : t("pipelines.composer.create")}
          </Button>
        </div>
      }
    >
      <div className="portal-pipelines__composer">
        <FormField label={t("pipelines.composer.name")} required>
          <Input
            value={name}
            placeholder={t("pipelines.composer.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>

        {/* Sources */}
        <div className="portal-pipelines__composer-section">
          <span className="portal-pipelines__detail-heading">
            {t("pipelines.composer.sources")}
          </span>
          {sourcesState.loading ? (
            <p className="portal-pipelines__muted">
              {t("pipelines.composer.sourcesLoading")}
            </p>
          ) : availableSources.length === 0 ? (
            <p className="portal-pipelines__muted">
              {t("pipelines.composer.noSources")}
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

          <span className="portal-pipelines__detail-heading">
            {t("pipelines.composer.trigger")}
          </span>
          <RadioGroup<string>
            name="pipeline-trigger"
            value={triggerType}
            onChange={setTriggerType}
            direction="horizontal"
            options={triggerOptions}
          />
          {triggerType === "schedule" && (
            <div className="portal-pipelines__schedule">
              <span className="portal-pipelines__muted">
                {t("pipelines.composer.scheduleEvery")}
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
                onChange={(e) =>
                  setScheduleUnit(e.target.value as ScheduleUnit)
                }
                options={SCHEDULE_UNITS.map((unit) => ({
                  value: unit,
                  label: t(`pipelines.composer.unit.${unit.toLowerCase()}`),
                }))}
              />
            </div>
          )}
        </div>

        {/* Operations */}
        <div className="portal-pipelines__composer-section">
          <span className="portal-pipelines__detail-heading">
            {t("pipelines.composer.operations", { count: steps.length })}
          </span>
          {steps.length === 0 ? (
            <p className="portal-pipelines__muted">
              {t("pipelines.composer.chainEmpty")}
            </p>
          ) : (
            <ol className="portal-pipelines__chain">
              {steps.map((step, i) => (
                <li
                  key={`${step.operation}-${i}`}
                  className="portal-pipelines__chain-row"
                >
                  <span className="portal-pipelines__chain-index">{i + 1}</span>
                  <span className="portal-pipelines__chain-op">
                    {humanizeOperation(step.operation)}
                  </span>
                  <div className="portal-pipelines__chain-actions">
                    <button
                      type="button"
                      aria-label={t("pipelines.composer.moveUp")}
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t("pipelines.composer.moveDown")}
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={t("pipelines.composer.removeStep")}
                      onClick={() => removeStep(i)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="portal-pipelines__op-palette">
            {PIPELINE_OPERATIONS.map((op) => (
              <Chip
                key={op.operation}
                tone="blue"
                size="sm"
                onClick={() => addStep(op.operation, op.parameters)}
              >
                {`+ ${humanizeOperation(op.operation)}`}
              </Chip>
            ))}
          </div>
        </div>

        {/* Output */}
        <div className="portal-pipelines__composer-section">
          <span className="portal-pipelines__detail-heading">
            {t("pipelines.composer.output")}
          </span>
          <RadioGroup<OutputMode>
            name="pipeline-output"
            value={outputMode}
            onChange={setOutputMode}
            direction="horizontal"
            options={[
              { value: "inline", label: t("pipelines.output.inline") },
              { value: "folder", label: t("pipelines.output.folder") },
            ]}
          />
          {outputMode === "folder" && (
            <FormField
              label={t("pipelines.composer.directory")}
              helperText={t("pipelines.composer.directoryHelp")}
              required
            >
              <Input
                value={outputDirectory}
                placeholder="/data/processed"
                onChange={(e) => setOutputDirectory(e.target.value)}
              />
            </FormField>
          )}
        </div>

        {error && <Banner tone="danger" description={error} />}
      </div>
    </Modal>
  );
}
