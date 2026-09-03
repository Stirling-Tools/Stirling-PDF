/** Reviewer-facing grouping for the Cause column; an unclassified kind is "Unrecognised". */

export type FailureCauseId = "inputRequired" | "unknown";

export interface FailureCause {
  id: FailureCauseId;
  labelKey: string;
  defaultLabel: string;
}

const CAUSES: Record<FailureCauseId, FailureCause> = {
  inputRequired: {
    id: "inputRequired",
    labelKey: "portal.failures.cause.inputRequired",
    defaultLabel: "Input required",
  },
  unknown: {
    id: "unknown",
    labelKey: "portal.failures.cause.unknown",
    defaultLabel: "Unrecognised",
  },
};

/** Which cause each known failure kind files under. Absent means unrecognised. */
const KIND_TO_CAUSE: Record<string, FailureCauseId> = {
  INPUT_PASSWORD_PROTECTED: "inputRequired",
};

export function causeOf(kindId: string): FailureCause {
  return CAUSES[KIND_TO_CAUSE[kindId] ?? "unknown"];
}
