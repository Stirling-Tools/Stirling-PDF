import type { PolicyExecutionTarget } from "@app/services/policyPipeline";

/**
 * Base URL for downloading a policy run's output file, given where the run
 * executed.
 *
 * Web builds are served from their own backend, so a relative request resolves
 * to the right place regardless of where the run ran, hence "" for every
 * target.
 */
export function getPolicyOutputBaseUrl(_target: PolicyExecutionTarget): string {
  return "";
}
