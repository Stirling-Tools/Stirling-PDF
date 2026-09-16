import apiClient from "@app/services/apiClient";

export interface ToolRecommendationDto {
  toolKey: string;
  score: number;
}

const BASE_PATH = "/api/v1/proprietary/ui-data/tool-recommendations";

// A 404 can also be a proxy hiccup mid-deploy, so one is not proof the route is
// gone. A 501 is the install answering deliberately, and latches immediately.
const MISSING_ROUTE_STRIKES = 3;

let backendUnavailable = false;
let consecutiveNotFound = 0;

export function resetToolRecommendationsAvailabilityForTests(): void {
  backendUnavailable = false;
  consecutiveNotFound = 0;
}

function noteFailure(error: unknown): void {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === 501) {
    // The install records no usage, or has no signed-in user to rank for.
    backendUnavailable = true;
    return;
  }
  if (status === 404) {
    consecutiveNotFound += 1;
    if (consecutiveNotFound >= MISSING_ROUTE_STRIKES) backendUnavailable = true;
    return;
  }
  consecutiveNotFound = 0;
}

function noteSuccess(): void {
  consecutiveNotFound = 0;
}

/**
 * Ranked tools for the current context, or null when the backend cannot serve
 * them (core-only build, login disabled, usage tracking off, network failure)
 * so callers fall back to the static recommended list.
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
    noteSuccess();
    return response.data?.recommendations ?? [];
  } catch (error) {
    noteFailure(error);
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
    noteSuccess();
  } catch (error) {
    noteFailure(error);
  }
}
