import { useMemo } from "react";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { ROW_ACCENT } from "@app/components/policies/policyStatus";
import type { FileItemPolicyRef } from "@app/components/shared/FileSidebarFileItem";

/** Policy accent name (ROW_ACCENT) → the CSS colour var the badge uses. */
const ACCENT_VAR: Record<string, string> = {
  blue: "var(--color-blue)",
  purple: "var(--color-purple)",
  green: "var(--color-green)",
  amber: "var(--color-amber)",
  red: "var(--color-red)",
};

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
        list.push({
          id: run.categoryId,
          name,
          accentColor: ACCENT_VAR[ROW_ACCENT[run.categoryId] ?? "blue"],
        });
        byFile.set(run.fileId, list);
      }
    }
    return byFile;
  }, [runs]);
}
