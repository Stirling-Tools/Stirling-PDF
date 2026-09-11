import { getPolicyRunOutcomes } from "@app/components/policies/policyRunStore";
import { loadPolicies } from "@app/services/policyStorage";

/** Read persisted outcomes synchronously so enforcement never waits for the UI mirror. */
export function getPolicyBlock(fileId: string): string | undefined {
  const policies = loadPolicies();
  return Object.values(getPolicyRunOutcomes()).find(
    (outcome) =>
      outcome.fileId === fileId &&
      outcome.status === "FAILED" &&
      policies[outcome.policyKey]?.required,
  )?.policyKey;
}

/** Whether a required policy currently blocks this file from use or export. */
export function isFileBlocked(fileId: string): boolean {
  return getPolicyBlock(fileId) !== undefined;
}
