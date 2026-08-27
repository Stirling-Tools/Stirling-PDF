import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";

// Classification is available on every proprietary-based build: the classify
// policy labels server-side with AI on, the in-browser heuristic labels with AI
// off. Both belong to the Processor, so an editor-only server has neither.

export function useClassificationEnabled(): boolean {
  return useProcessorEnabled();
}
