// SaaS override of the classification-enabled seam: classification is available
// exactly when the AI engine is on for this tenant. Off → the sidebar grouping,
// group-picker, per-file label chips and the file-details Classification section
// all stay hidden, so an AI-disabled SaaS tenant sees the plain flat file list
// with no hint the feature exists.

import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";

export function useClassificationEnabled(): boolean {
  return useAiEngineEnabled();
}
