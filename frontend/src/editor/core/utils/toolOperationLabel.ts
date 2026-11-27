import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ToolOperation } from "@editor/types/file";
import ToolRegistryContext from "@editor/contexts/ToolRegistryContext";

/**
 * What produced a version, for the history surfaces. A policy run carries its own label (the
 * pipeline's name) because every policy records the same "automate" toolId, which would otherwise
 * render every automated version identically.
 *
 * `toolName` is the tool's registry name, so history reads exactly as the tool list does; the
 * translation lookup only covers tools the registry no longer has.
 */
export function toolOperationLabel(
  operation: ToolOperation,
  t: TFunction,
  toolName?: string,
): string {
  // Truthiness, not nullish: a blank label would otherwise render as an empty history entry.
  return (
    operation.label ||
    toolName ||
    t(`home.${operation.toolId}.title`, operation.toolId)
  );
}

/** {@link toolOperationLabel} with the registry name filled in, where a registry is mounted. */
export function useToolOperationLabel(): (operation: ToolOperation) => string {
  const { t } = useTranslation();
  const registry = useContext(ToolRegistryContext);
  return useCallback(
    (operation: ToolOperation) =>
      toolOperationLabel(
        operation,
        t,
        registry?.getToolById(operation.toolId)?.name,
      ),
    [t, registry],
  );
}
