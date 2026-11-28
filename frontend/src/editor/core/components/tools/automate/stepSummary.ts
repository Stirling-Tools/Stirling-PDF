import type { TFunction } from "i18next";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import type { ToolId } from "@editor/types/toolId";

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
