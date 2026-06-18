import { getApiBaseUrl } from "@app/services/apiClientConfig";

/**
 * Base URL for AI-engine calls (orchestrate stream, AI result-file download).
 *
 * Web builds talk to whichever backend the app is served from, so the normal API
 * base is correct. Desktop shadows this (desktop/services/aiBaseUrl) to point at
 * the SaaS backend, since the AI engine only runs in the cloud.
 */
export function getAiBaseUrl(): string {
  return getApiBaseUrl().replace(/\/$/, ""); // Remove trailing slash
}
