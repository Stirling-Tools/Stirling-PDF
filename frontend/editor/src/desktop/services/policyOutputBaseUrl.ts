import { connectedServerBaseUrl } from "@app/services/connectedServerBaseUrl";
import type { PolicyExecutionTarget } from "@app/services/policyPipeline";

/** Desktop: a run's outputs live on the server that executed it. Absolute, because outputs come
 *  from a tool endpoint the router would otherwise divert to the bundled backend when offline. */
export function getPolicyOutputBaseUrl(target: PolicyExecutionTarget): string {
  return target === "saas" ? connectedServerBaseUrl() : "";
}
