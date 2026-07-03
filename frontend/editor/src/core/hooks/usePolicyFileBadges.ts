import type { FileItemPolicyRef } from "@app/components/shared/FileSidebarFileItem";

/** Minimal provenance shape needed to resolve a file's inherited badges. */
export type LineageStub = {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
};

/**
 * Policies that have run on each file, keyed by fileId — drives the shield
 * badges in the file sidebar. Empty in core; the proprietary build shadows this
 * with an implementation backed by the policy run store. `_extraStubs` lets
 * callers supply storage-backed stubs so closed files resolve lineage too.
 */
export function usePolicyFileBadges(
  _extraStubs?: ReadonlyArray<LineageStub>,
): Map<string, FileItemPolicyRef[]> {
  return new Map();
}

/**
 * The policy currently working on each file, keyed by fileId — drives the
 * file-row processing spinner. Empty in core; the proprietary build shadows this
 * with an implementation backed by the policy run store.
 */
export function usePolicyFileProcessing(): Map<string, FileItemPolicyRef> {
  return new Map();
}
