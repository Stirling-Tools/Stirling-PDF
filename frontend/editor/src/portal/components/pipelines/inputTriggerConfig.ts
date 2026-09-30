import type { TriggerConfig } from "@portal/api/pipelines";
import {
  MANUAL,
  type ScheduleUnit,
  type WorkingInput,
} from "@portal/components/pipelines/PipelineInputTrigger";

export function parseTrigger(trigger: TriggerConfig | null): {
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

/** The trigger config for the input row, or null for a manual (on-demand) input. */
export function buildTriggerFor(input: WorkingInput): TriggerConfig | null {
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
