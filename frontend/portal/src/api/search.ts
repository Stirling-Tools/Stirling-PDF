import { httpJson } from "@portal/api/http";
import type { QuickAction } from "@portal/mocks/search";

export type { QuickAction };

/** GET /v1/search/quick-actions */
export async function fetchQuickActions(): Promise<QuickAction[]> {
  return httpJson<QuickAction[]>("/v1/search/quick-actions");
}
