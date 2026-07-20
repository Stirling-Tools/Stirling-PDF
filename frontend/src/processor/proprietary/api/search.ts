import { apiClient } from "@processor/api/http";

export interface QuickAction {
  group: "Jump to" | "Create" | "Theme";
  label: string;
  /** Keyboard hint shown to the right. */
  hint: string;
}

/** GET /v1/search/quick-actions */
export async function fetchQuickActions(): Promise<QuickAction[]> {
  return apiClient.local.json<QuickAction[]>("/v1/search/quick-actions");
}
