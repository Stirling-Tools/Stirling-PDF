import type { AutomationConfig } from "@editor/types/automation";

/**
 * For an automation, the action that opens the Processor's new-pipeline page with its
 * steps filled in, so the user only adds where files come from and where they go.
 * Null when it cannot be offered: no Processor in this build, no access to it, or a
 * step the Processor cannot run.
 */
export type PipelineOpener = (
  automation: AutomationConfig,
) => (() => void) | null;

export function useOpenAsPipeline(): PipelineOpener {
  return () => null;
}
