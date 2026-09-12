import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import { connectionModeService } from "@app/services/connectionModeService";
import type { PolicyExecutionTarget } from "@app/services/policyPipeline";

/**
 * Desktop: a policy run's outputs live on the backend that executed it.
 *
 * Absolute in both connected modes. Outputs are fetched from /api/v1/general/files, which
 * operationRouter classifies as a tool endpoint, so a relative path would be diverted to
 * the bundled backend whenever the self-hosted server is briefly unreachable — and that
 * backend has never seen the run's file ids. Naming the server closes that door.
 *
 * Returning the cloud base outside SaaS would be worse still: the request interceptor
 * authenticates any absolute URL under the cloud base, so a self-hosted token would leave
 * for Stirling Cloud.
 */
export function getPolicyOutputBaseUrl(target: PolicyExecutionTarget): string {
  if (target !== "saas") return "";
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
