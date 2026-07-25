import { useMemo } from "react";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";
import { useAllFiles } from "@app/contexts/FileContext";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { policyAccentVar } from "@app/components/policies/policyStatus";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";

/** How long after a run a badge counts as "recent" (drives the one-off glow).
 *  Measured from run start — must exceed the longest realistic policy wall-clock
 *  time so the glow still fires after a slow run completes and imports. Old or
 *  reloaded runs fall outside this window, suppressing the glow on page reload. */
const RECENT_MS = 5 * 60 * 1000;

/** Minimal provenance shape needed to resolve a file's inherited badges. */
type LineageStub = {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
};

/** Merge a ref into a list, deduping by policy id. A direct (recent) hit wins
 *  the glow over an inherited one, and a failure marker is never lost. */
function mergeRef(list: FileItemPolicyRef[], ref: FileItemPolicyRef): void {
  const existing = list.find((p) => p.id === ref.id);
  if (!existing) {
    list.push(ref);
    return;
  }
  if (ref.recent) existing.recent = true;
  if (ref.failed) existing.failed = true;
  if (ref.ignored) existing.ignored = true;
}

/** Terminal statuses — the only ones that can decide a file's failure marker. */
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

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
  // The latest terminal run per (policy, file) is that file's current outcome,
  // so a failure a later retry fixed stops counting.
  const latestByKey = new Map<string, PolicyRunRecord>();
  for (const run of runs) {
    if (!run.fileId || !TERMINAL_STATUSES.has(run.status)) continue;
    const key = `${run.categoryId}:${run.fileId}`;
    const prev = latestByKey.get(key);
    if (!prev || run.startedAt > prev.startedAt) latestByKey.set(key, run);
  }

  // Waived failures must not fall back to the "ran" shield below — approving a
  // failure can't be allowed to read as success.
  const acknowledgedFailureKeys = new Set<string>();
  for (const [key, run] of latestByKey) {
    if (run.status === "FAILED" && run.acknowledged) {
      acknowledgedFailureKeys.add(key);
    }
  }

  const directByFile = new Map<string, FileItemPolicyRef[]>();
  for (const run of runs) {
    const name = labelById.get(run.categoryId);
    if (!name) continue;
    const recent = now - run.startedAt < RECENT_MS;
    for (const fileId of run.outputFileIds ?? []) {
      if (acknowledgedFailureKeys.has(`${run.categoryId}:${fileId}`)) continue;
      const list = directByFile.get(fileId) ?? [];
      if (!list.some((p) => p.id === run.categoryId)) {
        list.push({
          id: run.categoryId,
          name,
          accentColor: policyAccentVar(run.categoryId),
          recent,
        });
        directByFile.set(fileId, list);
      }
    }
  }

  // A failed run marks its INPUT file (a failure produces no output): unwaived
  // → amber warning, waived → the ignored marker.
  for (const run of latestByKey.values()) {
    if (run.status !== "FAILED" || run.retrying) continue;
    const name = labelById.get(run.categoryId);
    if (!name) continue;
    const mark = run.acknowledged
      ? { ignored: true }
      : { failed: true, recent: now - run.startedAt < RECENT_MS };
    const list = directByFile.get(run.fileId) ?? [];
    const existing = list.find((p) => p.id === run.categoryId);
    if (existing) {
      Object.assign(existing, mark);
    } else {
      list.push({
        id: run.categoryId,
        name,
        accentColor: policyAccentVar(run.categoryId),
        recent: false,
        ...mark,
      });
      directByFile.set(run.fileId, list);
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

  // In-flight pass: add (or upgrade) a badge on the input file for any run that
  // is currently being processed, so the sidebar shows a spinning indicator
  // while the policy is actively enforcing — not just after it completes.
  // Keep the spinner until `imported` is true: the status reaches COMPLETED
  // before the output files are imported into the workspace, so gating on
  // status alone would drop the badge during that async gap.
  for (const run of runs) {
    if (!run.fileId) continue;
    const settled =
      run.imported || run.status === "FAILED" || run.status === "CANCELLED";
    if (settled && !run.retrying) continue;
    const name = labelById.get(run.categoryId);
    if (!name) continue;
    const list = result.get(run.fileId) ?? [];
    const existing = list.find((p) => p.id === run.categoryId);
    if (existing) {
      existing.enforcing = true;
    } else {
      list.push({
        id: run.categoryId,
        name,
        accentColor: policyAccentVar(run.categoryId),
        recent: false,
        enforcing: true,
      });
      result.set(run.fileId, list);
    }
  }

  // Failures first, so truncating the row can never hide a warning.
  for (const list of result.values()) {
    list.sort((a, b) => Number(b.failed ?? false) - Number(a.failed ?? false));
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
