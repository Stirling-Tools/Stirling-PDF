import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import { connectionModeService } from "@app/services/connectionModeService";

/**
 * Desktop: base URL for AI-engine calls, which the local bundled backend never serves.
 *
 * Absolute in both connected modes, because one consumer is a raw fetch (the orchestrate
 * stream) where a relative path would resolve against the webview origin rather than the
 * server. Empty in local mode, where there is no engine to reach.
 *
 * Read from the cached mode so it stays synchronous; an unresolved mode yields "" rather
 * than guessing, so a call made that early fails locally instead of reaching the wrong server.
 */
export function getAiBaseUrl(): string {
  const mode = connectionModeService.getCachedMode();
  if (mode === "saas") {
    return (STIRLING_SAAS_BACKEND_API_URL ?? "").replace(/\/$/, "");
  }
  if (mode === "selfhosted") {
    return (connectionModeService.getCachedServerConfig()?.url ?? "").replace(
      /\/$/,
      "",
    );
  }
  return "";
}
