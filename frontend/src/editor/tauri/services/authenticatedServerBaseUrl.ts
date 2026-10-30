import i18n from "@editor/i18n";
import {
  isLocalProcessingOnly,
  documentPrivacyError,
} from "@editor/services/documentPrivacyService";
import { authService } from "@editor/services/authService";
import { connectionModeService } from "@editor/services/connectionModeService";
import { STIRLING_SAAS_BACKEND_API_URL } from "@editor/constants/connection";

/** Policies, processing folders, automation and pipelines run on the signed-in server only. */
export function isServerAutomationEndpoint(endpoint = ""): boolean {
  const path = endpoint.startsWith("http")
    ? new URL(endpoint).pathname
    : endpoint;
  return /^\/api\/v1\/(policies|processing-folders|automation|pipeline)(?:[/?]|$)/.test(
    path,
  );
}

/**
 * Base URL, without a trailing slash, of the server the user is signed in to.
 * Rejects under the managed privacy policy, in local mode, and when signed out:
 * automation, AI streams and their outputs must never reach a server on behalf of
 * someone who has not authenticated with it, nor fall back to a bundled backend.
 */
export async function resolveAuthenticatedServerBaseUrl(): Promise<string> {
  if (await isLocalProcessingOnly()) throw documentPrivacyError();
  const mode = await connectionModeService.getCurrentMode();
  await authService.awaitRefreshIfInProgress();
  if (mode === "local" || !(await authService.isAuthenticated())) {
    throw new Error(
      i18n.t(
        "localMode.automationUnavailable",
        "Sign in to Stirling Cloud or a self-hosted server to use processing folders and pipelines.",
      ),
    );
  }
  const url =
    mode === "saas"
      ? STIRLING_SAAS_BACKEND_API_URL
      : (await connectionModeService.getServerConfig())?.url;
  if (!url) throw new Error("Server configuration not found");
  return url.replace(/\/$/, "");
}
