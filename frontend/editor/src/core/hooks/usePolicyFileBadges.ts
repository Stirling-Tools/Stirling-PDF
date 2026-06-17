import type { FileItemPolicyRef } from "@app/components/shared/FileSidebarFileItem";

/**
 * Policies that have run on each file, keyed by fileId — drives the shield
 * badges in the file sidebar. Empty in core; the proprietary build shadows this
 * with an implementation backed by the policy run store.
 */
export function usePolicyFileBadges(): Map<string, FileItemPolicyRef[]> {
  return new Map();
}
