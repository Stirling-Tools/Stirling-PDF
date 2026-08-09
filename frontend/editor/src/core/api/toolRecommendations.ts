import apiClient from "@app/services/apiClient";

export interface ToolRecommendationDto {
  toolKey: string;
  score: number;
}

/** Dismiss in every context (used when no tool is active). */
export const ANY_CONTEXT = "*";

const BASE_PATH = "/api/v1/proprietary/ui-data/tool-recommendations";

// Core-only backends have no recommendations API; remember the 404 so we stop asking.
let backendUnavailable = false;

export function resetToolRecommendationsAvailabilityForTests(): void {
  backendUnavailable = false;
}

function markUnavailableOn404(error: unknown): void {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === 404 || status === 501) backendUnavailable = true;
}

/**
 * Ranked tools for the current context, or null when the backend cannot serve
 * them (core-only build, logged out, network failure) so callers fall back to
 * the static recommended list.
 */
export async function fetchToolRecommendations(
  currentTool: string | null,
  limit = 6,
): Promise<ToolRecommendationDto[] | null> {
  if (backendUnavailable) return null;
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (currentTool) params.set("currentTool", currentTool);
    const response = await apiClient.get<{
      recommendations: ToolRecommendationDto[];
    }>(`${BASE_PATH}?${params}`, {
      suppressErrorToast: true,
      skipAuthRedirect: true,
    });
    return response.data?.recommendations ?? [];
  } catch (error) {
    markUnavailableOn404(error);
    return null;
  }
}

/** Fire-and-forget: usage tracking must never surface errors to the user. */
export async function recordToolUsage(
  toolKey: string,
  previousToolKey?: string,
): Promise<void> {
  if (backendUnavailable) return;
  try {
    await apiClient.post(
      `${BASE_PATH}/usage`,
      { toolKey, previousToolKey },
      { suppressErrorToast: true, skipAuthRedirect: true },
    );
  } catch (error) {
    markUnavailableOn404(error);
  }
}

export async function dismissToolRecommendation(
  contextTool: string | null,
  dismissedTool: string,
): Promise<void> {
  await apiClient.post(
    `${BASE_PATH}/dismissals`,
    { contextTool: contextTool ?? ANY_CONTEXT, dismissedTool },
    { suppressErrorToast: true, skipAuthRedirect: true },
  );
}

export async function undoDismissToolRecommendation(
  contextTool: string | null,
  dismissedTool: string,
): Promise<void> {
  const params = new URLSearchParams({
    contextTool: contextTool ?? ANY_CONTEXT,
    dismissedTool,
  });
  await apiClient.delete(`${BASE_PATH}/dismissals?${params}`, {
    suppressErrorToast: true,
    skipAuthRedirect: true,
  });
}
