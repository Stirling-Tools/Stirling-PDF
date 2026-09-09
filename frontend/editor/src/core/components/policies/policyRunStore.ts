/**
 * Core stub — the real implementation lives in the proprietary overlay.
 * Returns empty state so core-build consumers compile without a policyRunStore module.
 */

export interface PolicyRunRecord {
  runId: string;
  categoryId: string;
  fileId: string;
  fileName: string;
  status: string;
  currentStep?: number;
  stepCount?: number;
  error: string | null;
  retrying?: boolean;
  startedAt: number;
}

export const POLICY_IN_FLIGHT_STATUSES = [
  "PENDING",
  "RUNNING",
  "WAITING_FOR_INPUT",
] as const;

export function usePolicyRuns(): PolicyRunRecord[] {
  return [];
}
