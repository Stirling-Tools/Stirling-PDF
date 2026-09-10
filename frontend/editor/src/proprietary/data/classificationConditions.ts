import type { Condition, MatchesAnyCondition } from "@app/conditions/types";

/** Creates the classification comparison offered by the policy wizard and pipeline builder. */
export function classificationCondition(
  values: string[] = [],
): MatchesAnyCondition {
  return {
    input: { source: "document", field: "classification.labels" },
    operator: "matches-any",
    values,
  };
}

/** Classification facts require a classifier-produced verdict; unrelated facts do not. */
export function requiresClassification(condition: Condition): boolean {
  return (
    condition.input.source === "document" &&
    condition.input.field.startsWith("classification.")
  );
}
