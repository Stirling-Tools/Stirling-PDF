import type { TFunction } from "i18next";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import type { ToolId } from "@editor/types/toolId";

export function defaultParametersFor(
  toolRegistry: Partial<ToolRegistry>,
  operation: string,
): Record<string, unknown> {
  const defaults =
    toolRegistry[operation as ToolId]?.operationConfig?.defaultParameters;
  return defaults ? { ...defaults } : {};
}

/**
 * Whether a step can run as configured. Registry defaults count as configured;
 * only a tool's own `validateParams` can reject them. An operation the registry
 * does not know is left for the executor to report, as it was saved that way.
 */
export function isStepReady(
  toolRegistry: Partial<ToolRegistry>,
  operation: string,
  parameters: Record<string, unknown> | undefined,
): boolean {
  if (!operation) return false;
  const config = toolRegistry[operation as ToolId]?.operationConfig;
  if (!config?.validateParams) return true;
  return config.validateParams({
    ...defaultParametersFor(toolRegistry, operation),
    ...(parameters ?? {}),
  });
}

export function toolDisplayName(
  t: TFunction,
  toolRegistry: Partial<ToolRegistry>,
  operation: string,
): string {
  return (
    toolRegistry[operation as ToolId]?.name ??
    t(`tools.${operation}.name`, operation)
  );
}
