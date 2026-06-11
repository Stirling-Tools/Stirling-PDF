import { useMemo } from "react";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";
import { useAllFiles } from "@app/contexts/FileContext";
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

/** Minimal lineage shape needed to walk a file's version chain. */
type LineageStub = { id: string; parentFileId?: string };

/** Merge a ref into a list, deduping by policy id. A direct (recent) hit wins
 *  the glow over an inherited one for the same policy. */
function mergeRef(list: FileItemPolicyRef[], ref: FileItemPolicyRef): void {
  const existing = list.find((p) => p.id === ref.id);
  if (!existing) {
    list.push(ref);
  } else if (ref.recent) {
    existing.recent = true;
  }
}

/**
 * Pure core of {@link usePolicyFileBadges} (no React/storage deps, so it's
 * unit-testable). Returns the policies that have run on each file, keyed by
 * fileId.
 *
 * A policy run is pinned to a specific output fileId, so a later tool edit
 * produces a NEW file that wouldn't carry the badge — "been through a policy"
 * would vanish the moment you edit the file. To keep the badge with the
 * document, every file also INHERITS its ancestors' badges by walking the
 * version lineage (`parentFileId`). Inherited badges never glow (recent=false):
 * only the original application does.
 */
export function buildPolicyBadgeMap(
  runs: ReadonlyArray<PolicyRunRecord>,
  stubs: ReadonlyArray<LineageStub>,
  labelById: ReadonlyMap<string, string>,
  now: number,
): Map<string, FileItemPolicyRef[]> {
  // Direct badges: a file that IS a policy run's output.
  const directByFile = new Map<string, FileItemPolicyRef[]>();
  for (const run of runs) {
    const name = labelById.get(run.categoryId);
    if (!name) continue;
    const recent = now - run.startedAt < RECENT_MS;
    for (const fileId of run.outputFileIds ?? []) {
      const list = directByFile.get(fileId) ?? [];
      if (!list.some((p) => p.id === run.categoryId)) {
        list.push({
          id: run.categoryId,
          name,
          accentColor: ACCENT_VAR[ROW_ACCENT[run.categoryId] ?? "blue"],
          recent,
        });
        directByFile.set(fileId, list);
      }
    }
  }

  // Seed the result with the direct badges (cloning the arrays so the lineage
  // pass can mutate freely without touching the direct map).
  const result = new Map<string, FileItemPolicyRef[]>();
  for (const [id, refs] of directByFile) {
    if (refs.length)
      result.set(
        id,
        refs.map((r) => ({ ...r })),
      );
  }

  // Lineage pass: a tool-created child inherits its ancestors' badges, so the
  // badge follows the document as it's edited. Walk parentFileId upward,
  // collecting each ancestor's DIRECT badges (transitive — every level is
  // checked), marked recent=false (carried, not freshly applied).
  const parentOf = new Map<string, string | undefined>();
  for (const stub of stubs) parentOf.set(stub.id, stub.parentFileId);
  for (const stub of stubs) {
    const seen = new Set<string>([stub.id]);
    let ancestor = parentOf.get(stub.id);
    while (ancestor && !seen.has(ancestor)) {
      seen.add(ancestor);
      const ancestorBadges = directByFile.get(ancestor);
      if (ancestorBadges?.length) {
        const list = result.get(stub.id) ?? [];
        for (const ref of ancestorBadges)
          mergeRef(list, { ...ref, recent: false });
        result.set(stub.id, list);
      }
      ancestor = parentOf.get(ancestor);
    }
  }

  return result;
}

/**
 * Distinct policies that have produced each file, keyed by fileId, derived from
 * the reactive policy run store. Drives the file sidebar's shield badges. The
 * badge follows a document down its tool-edit chain — see
 * {@link buildPolicyBadgeMap}. Shadows the core stub via the {@code @app/*}
 * alias cascade.
 */
export function usePolicyFileBadges(): Map<string, FileItemPolicyRef[]> {
  const runs = usePolicyRuns();
  const { fileStubs } = useAllFiles();
  return useMemo(() => {
    const labelById = new Map(
      loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
    );
    return buildPolicyBadgeMap(runs, fileStubs, labelById, Date.now());
  }, [runs, fileStubs]);
}
