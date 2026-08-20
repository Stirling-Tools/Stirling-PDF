/**
 * When a pipeline's input fires. A swept source is scheduled or triggered server-side; the editor
 * is client-driven and instead runs as each file passes through, so the two get different controls.
 */

import { useTranslation } from "react-i18next";
import { FormField, Input, Select } from "@app/ui";

export type ScheduleUnit = "MINUTES" | "HOURS" | "DAYS";
export type EditorRunOn = "upload" | "export";

const SCHEDULE_UNITS: ScheduleUnit[] = ["MINUTES", "HOURS", "DAYS"];

/** Empty trigger type = manual-only (no automatic trigger). */
export const MANUAL = "";
/**
 * Sentinel for the manual choice: Mantine's Select reads an empty string as "no selection", so the
 * option needs a real value. Mapped to/from {@link MANUAL} at this component's edges.
 */
export const MANUAL_OPTION = "manual";

/** One input row in the builder: a source paired with its own trigger config. */
export interface WorkingInput {
  sourceId: string;
  triggerType: string;
  scheduleCount: string;
  scheduleUnit: ScheduleUnit;
}

export interface PipelineInputTriggerProps {
  input: WorkingInput;
  onInputChange: (patch: Partial<WorkingInput>) => void;
  /** Trigger types offered for this row's source (manual first). */
  triggerOptions: { value: string; label: string }[];
  /** The chosen source is the editor, so the pipeline runs in the browser. */
  isEditorInput: boolean;
  runOn: EditorRunOn;
  onRunOnChange: (runOn: EditorRunOn) => void;
}

export function PipelineInputTrigger({
  input,
  onInputChange,
  triggerOptions,
  isEditorInput,
  runOn,
  onRunOnChange,
}: PipelineInputTriggerProps) {
  const { t } = useTranslation();

  if (isEditorInput) {
    const label = t("portal.pipelines.builder.runOn", "Runs on");
    return (
      <FormField
        label={label}
        helperText={t(
          "portal.pipelines.builder.runOnHelper",
          "Editor pipelines run in the browser as each file passes through - there is no server-side sweep to schedule.",
        )}
      >
        <Select
          inputSize="sm"
          aria-label={label}
          value={runOn}
          onChange={(value) =>
            onRunOnChange(value === "export" ? "export" : "upload")
          }
          options={[
            {
              value: "upload",
              label: t("portal.pipelines.builder.runOnUpload", "Every upload"),
            },
            {
              value: "export",
              label: t("portal.pipelines.builder.runOnExport", "Every export"),
            },
          ]}
        />
      </FormField>
    );
  }

  return (
    <>
      <FormField label={t("portal.pipelines.builder.inputTrigger")}>
        <Select
          inputSize="sm"
          aria-label={t("portal.pipelines.builder.inputTrigger")}
          value={
            input.triggerType === MANUAL ? MANUAL_OPTION : input.triggerType
          }
          disabled={input.sourceId === ""}
          onChange={(value) =>
            onInputChange({
              triggerType: value && value !== MANUAL_OPTION ? value : MANUAL,
            })
          }
          options={triggerOptions}
        />
      </FormField>

      {input.triggerType === "schedule" && (
        <div className="portal-builder__schedule">
          <span className="portal-builder__muted">
            {t("portal.pipelines.composer.scheduleEvery")}
          </span>
          <Input
            inputSize="sm"
            type="number"
            min={1}
            value={input.scheduleCount}
            invalid={Number(input.scheduleCount) <= 0}
            onChange={(e) => onInputChange({ scheduleCount: e.target.value })}
            className="portal-builder__schedule-count"
          />
          <Select
            inputSize="sm"
            value={input.scheduleUnit}
            onChange={(value) =>
              value && onInputChange({ scheduleUnit: value as ScheduleUnit })
            }
            options={SCHEDULE_UNITS.map((unit) => ({
              value: unit,
              label: t(`portal.pipelines.composer.unit.${unit.toLowerCase()}`),
            }))}
          />
        </div>
      )}
    </>
  );
}
