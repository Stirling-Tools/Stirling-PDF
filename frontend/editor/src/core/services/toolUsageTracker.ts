import { recordToolUsage } from "@app/api/toolRecommendations";
import type { ToolId } from "@app/types/toolId";

// Module store rather than a context: tool completions happen deep in operation
// hooks, and every consumer only needs "which tool finished last".
let lastCompletedTool: ToolId | null = null;
const listeners = new Set<() => void>();

export function getLastCompletedTool(): ToolId | null {
  return lastCompletedTool;
}

export function subscribeToToolCompletions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call once per successful tool run; the backend scores it against its predecessor. */
export function notifyToolCompleted(toolId: ToolId): void {
  const previous = lastCompletedTool;
  lastCompletedTool = toolId;
  void recordToolUsage(toolId, previous ?? undefined);
  listeners.forEach((listener) => listener());
}

export function resetToolUsageTrackerForTests(): void {
  lastCompletedTool = null;
  listeners.clear();
}
