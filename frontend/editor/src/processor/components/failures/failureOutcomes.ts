import type { StatusTone } from "@app/ui";
import type { FileRunEventStatus } from "@processor/api/fileRunEvents";

/** How a closed failure was settled. Must stay in sync with the server's terminal statuses. */

interface FailureOutcome {
  labelKey: string;
  defaultLabel: string;
  tone: StatusTone;
}

const OUTCOMES: Partial<Record<FileRunEventStatus, FailureOutcome>> = {
  RESOLVED: {
    labelKey: "processor.failures.outcome.resolved",
    defaultLabel: "Resolved",
    tone: "success",
  },
  DISMISSED: {
    labelKey: "processor.failures.outcome.dismissed",
    defaultLabel: "Dismissed",
    tone: "neutral",
  },
  FILE_REMOVED: {
    labelKey: "processor.failures.outcome.fileRemoved",
    defaultLabel: "File deleted",
    tone: "neutral",
  },
};

const STILL_OPEN: FailureOutcome = {
  labelKey: "processor.failures.outcome.open",
  defaultLabel: "Open",
  tone: "info",
};

export function outcomeOf(status: FileRunEventStatus): FailureOutcome {
  return OUTCOMES[status] ?? STILL_OPEN;
}
