import apiClient from "@app/services/apiClient";

export interface ToolRecommendationDto {
  toolKey: string;
  score: number;
}

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

/**
 * Fire-and-forget: usage tracking must never surface errors to the user.
 *
 * `priorChains` holds the tools already applied to each input document, oldest
 * step first and excluding this run - one entry per document, empty for a fresh
 * upload. That is what makes a recorded transition mean "next for this file"
 * rather than "next click".
 */
export async function recordToolUsage(
  toolKey: string,
  priorChains: string[][] = [],
): Promise<void> {
  if (backendUnavailable) return;
  try {
    await apiClient.post(
      `${BASE_PATH}/usage`,
      { toolKey, priorChains },
      { suppressErrorToast: true, skipAuthRedirect: true },
    );
  } catch (error) {
    markUnavailableOn404(error);
  }
}
