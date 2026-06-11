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

/** Minimal provenance shape needed to resolve a file's inherited badges. */
type LineageStub = {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
};

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
 * document, every file also INHERITS the badges of the files it was derived
 * from: its transitive `sourceFileIds` (recorded at the consume boundary, so it
 * covers split/merge/convert too) plus, defensively, its `parentFileId`.
 * Because `sourceFileIds` is transitive, a flat lookup suffices — no chain walk,
 * and it survives a consumed intermediate. Inherited badges never glow
 * (recent=false): only the original application does.
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

  // Inheritance pass: a derived file carries the badges of every file it came
  // from. `sourceFileIds` is the transitive provenance set (so a flat lookup
  // catches even ancestors whose intermediate edits were consumed), and
  // `parentFileId` is included defensively for any child not created via a
  // consume. Inherited badges are marked recent=false (carried, not applied).
  for (const stub of stubs) {
    const sources = new Set<string>(stub.sourceFileIds ?? []);
    if (stub.parentFileId) sources.add(stub.parentFileId);
    for (const src of sources) {
      const srcBadges = directByFile.get(src);
      if (!srcBadges?.length) continue;
      const list = result.get(stub.id) ?? [];
      for (const ref of srcBadges) mergeRef(list, { ...ref, recent: false });
      result.set(stub.id, list);
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
