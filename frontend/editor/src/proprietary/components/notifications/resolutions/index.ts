import type { ToolId } from "@app/types/toolId";
import { repair } from "@app/components/notifications/resolutions/repair";
import type { Resolution } from "@app/components/notifications/resolutions/resolution";
import { unlock } from "@app/components/notifications/resolutions/unlock";

export {
  canRetry,
  rerunOutcome,
  resolutionSpec,
  retryTargetOf,
  toolOf,
  unavailable,
  type Resolution,
  type ResolutionActionId,
  type ResolutionDeps,
  type RetryTarget,
} from "@app/components/notifications/resolutions/resolution";

/**
 * Every fix this build can run. The action registry and the manual-run continuation both derive
 * from this list, so a new server kind that reuses an existing action needs no client change.
 */
export const RESOLUTIONS: readonly Resolution[] = [unlock, repair];

const TOOL_BY_ACTION = new Map<string, ToolId>(
  RESOLUTIONS.map((resolution) => [resolution.actionId, resolution.toolId]),
);

const RESOLVING_TOOLS = new Set<string>(
  RESOLUTIONS.map((resolution) => resolution.toolId),
);

/** The tool whose manual run counts as the resolution `actionId` offers, if any does. */
export function resolvingToolFor(actionId: string): ToolId | null {
  return TOOL_BY_ACTION.get(actionId) ?? null;
}

/** Whether a successful run of `operation` could be some open row's resolution. */
export function isResolvingTool(operation: string): boolean {
  return RESOLVING_TOOLS.has(operation);
}
