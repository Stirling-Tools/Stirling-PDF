// Swept sources are scheduled or triggered server-side; the editor runs client-side as each file
// passes through, so the two get different controls.

import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { FormField, Input, Select } from "@app/ui";

export type ScheduleUnit = "MINUTES" | "HOURS" | "DAYS";
export type EditorRunOn = "upload" | "export";

const SCHEDULE_UNITS: ScheduleUnit[] = ["MINUTES", "HOURS", "DAYS"];

/** Empty trigger type = manual-only (no automatic trigger). */
export const MANUAL = "";
/** Sentinel for manual: Mantine's Select reads "" as no selection. Maps to {@link MANUAL}. */
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
        label={
          <Tooltip
            label={t(
              "portal.pipelines.builder.runOnTooltip",
              "Choose when this pipeline runs on your files: when you add them, or when you export them.",
            )}
            position="right"
            withinPortal
            multiline
            w={260}
          >
            <span className="portal-builder__label-hint">
              {label}
              <InfoOutlinedIcon style={{ fontSize: "0.875rem" }} />
            </span>
          </Tooltip>
        }
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
