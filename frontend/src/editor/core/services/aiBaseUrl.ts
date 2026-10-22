import { getApiBaseUrl } from "@app/services/apiClientConfig";

/**
 * Base URL for AI-engine calls (orchestrate stream, AI result-file download).
 *
 * Web builds talk to the backend they are served from. Desktop shadows this, where the bundled
 * backend has no engine and the base is the connected server.
 */
export function getAiBaseUrl(): string {
  return getApiBaseUrl().replace(/\/$/, ""); // Remove trailing slash
}
