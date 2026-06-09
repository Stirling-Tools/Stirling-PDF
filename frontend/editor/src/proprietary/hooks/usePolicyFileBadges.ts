import { useMemo } from "react";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import type { FileItemPolicyRef } from "@app/components/shared/FileSidebarFileItem";

/**
 * Distinct policies that have run on each file, keyed by fileId, derived from the
 * reactive policy run store. Drives the file sidebar's shield badges. Shadows the
 * core stub via the {@code @app/*} alias cascade.
 */
export function usePolicyFileBadges(): Map<string, FileItemPolicyRef[]> {
  const runs = usePolicyRuns();
  return useMemo(() => {
    const labelById = new Map(
      loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
    );
    const byFile = new Map<string, FileItemPolicyRef[]>();
    for (const run of runs) {
      const name = labelById.get(run.categoryId);
      if (!name) continue;
      const list = byFile.get(run.fileId) ?? [];
      if (!list.some((p) => p.id === run.categoryId)) {
        list.push({ id: run.categoryId, name });
        byFile.set(run.fileId, list);
      }
    }
    return byFile;
  }, [runs]);
}
