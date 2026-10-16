import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import { connectionModeService } from "@app/services/connectionModeService";

/** Absolute base of the connected server, or "" in local mode and before the mode resolves.
 *  Read from the cached mode so callers building a URL inline stay synchronous. */
export function connectedServerBaseUrl(): string {
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
