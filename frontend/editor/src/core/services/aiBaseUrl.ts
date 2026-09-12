import { getApiBaseUrl } from "@app/services/apiClientConfig";

/**
 * Base URL for AI-engine calls (orchestrate stream, AI result-file download).
 *
 * Web builds talk to whichever backend the app is served from, so the normal API
 * base is correct. Desktop shadows this (desktop/services/aiBaseUrl), where the
 * bundled backend has no engine and the base is the connected server.
 */
export function getAiBaseUrl(): string {
  return getApiBaseUrl().replace(/\/$/, ""); // Remove trailing slash
}
