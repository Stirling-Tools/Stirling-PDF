import type { FileId } from "@app/types/file";

export interface PolicyRecovery {
  /**
   * Re-run the required policy blocking a file. The block lifts only if the run
   * now succeeds (cleared on its terminal COMPLETED); a second failure re-blocks.
   */
  reRunPolicy: (fileId: FileId) => void;
}

// Stable identity so consumers that list `reRunPolicy` in a memo/effect dep array
// don't recompute every render in the core build.
const NOOP_RECOVERY: PolicyRecovery = { reRunPolicy: () => {} };

/**
 * Recovery actions for policy-blocked files. Policies are proprietary, so the
 * core build has nothing to re-run - the proprietary build shadows this via the
 * `@app/*` alias with an implementation backed by the policy dispatch engine.
 */
export function usePolicyRecovery(): PolicyRecovery {
  return NOOP_RECOVERY;
}
