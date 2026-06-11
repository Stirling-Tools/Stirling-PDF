import { useMemo } from "react";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { ROW_ACCENT } from "@app/components/policies/policyStatus";
import type { FileItemPolicyRef } from "@app/components/shared/FileSidebarFileItem";

/** How long after a run a badge counts as "recent" (drives the one-off glow).
 *  Covers the run + import delay; old/reloaded runs fall outside it, so the glow
 *  fires only just after a policy is applied, not on every page reload. */
const RECENT_MS = 60_000;

/** Policy accent name (ROW_ACCENT) → the CSS colour var the badge uses. */
const ACCENT_VAR: Record<string, string> = {
  blue: "var(--color-blue)",
  purple: "var(--color-purple)",
  green: "var(--color-green)",
  amber: "var(--color-amber)",
  red: "var(--color-red)",
};

/**
 * Distinct policies that have produced each file, keyed by fileId, derived from
 * the reactive policy run store. Drives the file sidebar's shield badges. The
 * badge marks a policy's OUTPUT (the versioned/added result), not the input it
 * ran on — so it keys off each run's imported output fileIds. Shadows the core
 * stub via the {@code @app/*} alias cascade.
 */
export function usePolicyFileBadges(): Map<string, FileItemPolicyRef[]> {
  const runs = usePolicyRuns();
  return useMemo(() => {
    const labelById = new Map(
      loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
    );
    const now = Date.now();
    const byFile = new Map<string, FileItemPolicyRef[]>();
    for (const run of runs) {
      const name = labelById.get(run.categoryId);
      if (!name) continue;
      const recent = now - run.startedAt < RECENT_MS;
      for (const fileId of run.outputFileIds ?? []) {
        const list = byFile.get(fileId) ?? [];
        if (!list.some((p) => p.id === run.categoryId)) {
          list.push({
            id: run.categoryId,
            name,
            accentColor: ACCENT_VAR[ROW_ACCENT[run.categoryId] ?? "blue"],
            recent,
          });
          byFile.set(fileId, list);
        }
      }
    }
    return byFile;
  }, [runs]);
}
