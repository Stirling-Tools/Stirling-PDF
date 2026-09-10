import type { Condition } from "@app/conditions/types";

/** Whether the comparison has an input and operands ready to submit to ConditionValidator. */
export function isConditionComplete(condition: Condition): boolean {
  return (
    condition.input.field.trim() !== "" &&
    condition.values.some((value) => value.trim() !== "")
  );
}
