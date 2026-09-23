import { operationRouter } from "@app/services/operationRouter";
import type { PolicyExecutionTarget } from "@app/services/policyPipeline";

/**
 * Desktop: a policy run's outputs live on the backend that executed it.
 */
export async function getPolicyOutputBaseUrl(
  _target: PolicyExecutionTarget,
): Promise<string> {
  return operationRouter.getBaseUrl("/api/v1/policies");
}
