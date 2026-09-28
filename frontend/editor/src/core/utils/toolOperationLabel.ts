import type { TFunction } from "i18next";
import type { ToolOperation } from "@app/types/file";

/**
 * What produced a version, for the history surfaces. A policy run carries its own label (the
 * pipeline's name) because every policy records the same "automate" toolId, which would otherwise
 * render every automated version identically.
 */
export function toolOperationLabel(
  operation: ToolOperation,
  t: TFunction,
): string {
  // Truthiness, not nullish: a blank label would otherwise render as an empty history entry.
  return (
    operation.label || t(`home.${operation.toolId}.title`, operation.toolId)
  );
}
