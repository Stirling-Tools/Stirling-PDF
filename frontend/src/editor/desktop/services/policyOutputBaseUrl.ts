import { STIRLING_SAAS_BACKEND_API_URL } from "@editor/constants/connection";
import type { PolicyExecutionTarget } from "@editor/services/policyPipeline";

/**
 * Desktop: a policy run's outputs live on the backend that executed it.
 */
export function getPolicyOutputBaseUrl(target: PolicyExecutionTarget): string {
  if (target === "saas") {
    return (STIRLING_SAAS_BACKEND_API_URL ?? "").replace(/\/$/, "");
  }
  return "";
}
