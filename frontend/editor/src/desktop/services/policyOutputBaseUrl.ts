import { STIRLING_SAAS_BACKEND_API_URL } from "@app/constants/connection";
import { connectionModeService } from "@app/services/connectionModeService";
import type { PolicyExecutionTarget } from "@app/services/policyPipeline";

/**
 * Desktop: a policy run's outputs live on the backend that executed it.
 *
 * Only Stirling Cloud needs an absolute base; every other mode returns "" so the relative
 * path resolves through operationRouter, which already sends a self-hosted call to that
 * server. Returning the cloud base outside SaaS would attach the user's self-hosted token
 * to a Stirling Cloud request, because the request interceptor authenticates any absolute
 * URL under the cloud base.
 */
export function getPolicyOutputBaseUrl(target: PolicyExecutionTarget): string {
  if (target !== "saas" || connectionModeService.getCachedMode() !== "saas") {
    return "";
  }
  return (STIRLING_SAAS_BACKEND_API_URL ?? "").replace(/\/$/, "");
}
