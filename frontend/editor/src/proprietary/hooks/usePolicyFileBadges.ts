import { useMemo, useRef } from "react";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";
import { useAllFiles } from "@app/contexts/FileContext";
import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { policyAccentVar } from "@app/components/policies/policyStatus";
import { isClassificationCategory } from "@app/data/classificationPolicy";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";

/** Shared empty result, so a Processor-less build hands back one identity. */
const NO_BADGES: Map<string, FileItemPolicyRef[]> = new Map();

/** Minimal provenance shape needed to resolve a file's inherited badges. */
type LineageStub = {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
};

/** Merge a ref into a list, deduping by policy id. */
function mergeRef(list: FileItemPolicyRef[], ref: FileItemPolicyRef): void {
  if (!list.some((p) => p.id === ref.id)) {
    list.push(ref);
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
 * and it survives a consumed intermediate.
 */
export function buildPolicyBadgeMap(
  runs: ReadonlyArray<PolicyRunRecord>,
  stubs: ReadonlyArray<LineageStub>,
  labelById: ReadonlyMap<string, string>,
): Map<string, FileItemPolicyRef[]> {
  // Direct badges: a file that IS a policy run's output.
  const directByFile = new Map<string, FileItemPolicyRef[]>();
  for (const run of runs) {
    const name = labelById.get(run.categoryId);
    if (!name) continue;
    for (const fileId of run.outputFileIds ?? []) {
      const list = directByFile.get(fileId) ?? [];
      if (!list.some((p) => p.id === run.categoryId)) {
        list.push({
          id: run.categoryId,
          name,
          accentColor: policyAccentVar(run.categoryId),
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
  // consume.
  for (const stub of stubs) {
    const sources = new Set<string>(stub.sourceFileIds ?? []);
    if (stub.parentFileId) sources.add(stub.parentFileId);
    for (const src of sources) {
      const srcBadges = directByFile.get(src);
      if (!srcBadges?.length) continue;
      const list = result.get(stub.id) ?? [];
      for (const ref of srcBadges) mergeRef(list, { ...ref });
      result.set(stub.id, list);
    }
  }

  // In-flight pass: add (or upgrade) a badge on the input file for any run that
  // is currently being processed, so the sidebar shows a spinning indicator
  // while the policy is actively running — not just after it completes.
  // Blocking policies set `enforcing` (which gates actions/overlays);
  // classification is non-blocking, so it sets `background` instead — same
  // spinner, but nothing is ever gated on it.
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
    const inFlightFlag = isClassificationCategory(run.categoryId)
      ? ("background" as const)
      : ("enforcing" as const);
    const list = result.get(run.fileId) ?? [];
    const existing = list.find((p) => p.id === run.categoryId);
    if (existing) {
      existing[inFlightFlag] = true;
    } else {
      list.push({
        id: run.categoryId,
        name,
        accentColor: policyAccentVar(run.categoryId),
        [inFlightFlag]: true,
      });
      result.set(run.fileId, list);
    }
  }

  return result;
}

/** Field-wise equality for a badge ref — the whole shape `PolicyBadges` renders. */
function sameRef(a: FileItemPolicyRef, b: FileItemPolicyRef): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.accentColor === b.accentColor &&
    !!a.enforcing === !!b.enforcing &&
    !!a.background === !!b.background
  );
}

function sameRefs(a: FileItemPolicyRef[], b: FileItemPolicyRef[]): boolean {
  return a.length === b.length && a.every((ref, i) => sameRef(ref, b[i]));
}

/**
 * Carry the previous map's array references over to files whose badges didn't
 * change, and return the previous MAP itself when none did.
 *
 * {@link buildPolicyBadgeMap} allocates a fresh array per badged file on every
 * call, and the run store hands back a new `runs` array on every status poll —
 * so without this, one file's poll tick gives EVERY badged file a new `policies`
 * identity, and the memoized sidebar rows can never bail out (the case the
 * memoization exists for). `NO_POLICIES` in FileSidebar only covers the rows
 * with no badges at all.
 */
export function reusePolicyBadgeArrays(
  previous: Map<string, FileItemPolicyRef[]> | null,
  next: Map<string, FileItemPolicyRef[]>,
): Map<string, FileItemPolicyRef[]> {
  if (!previous) return next;
  let changed = previous.size !== next.size;
  for (const [fileId, refs] of next) {
    const before = previous.get(fileId);
    if (before && sameRefs(before, refs)) next.set(fileId, before);
    else changed = true;
  }
  return changed ? next : previous;
}

/**
 * Distinct policies that have produced each file, keyed by fileId, derived from
 * the reactive policy run store. Drives the file sidebar's shield badges. The
 * badge follows a document down its tool-edit chain — see
 * {@link buildPolicyBadgeMap}. Shadows the core stub via the {@code @app/*}
 * alias cascade.
 *
 * Per-file array identity is preserved across rebuilds so memoized consumers
 * (the sidebar rows) only re-render for the file that actually changed — see
 * {@link reusePolicyBadgeArrays}.
 */
export function usePolicyFileBadges(): Map<string, FileItemPolicyRef[]> {
  const processorEnabled = useProcessorEnabled();
  const runs = usePolicyRuns();
  const { fileStubs } = useAllFiles();
  const previous = useRef<Map<string, FileItemPolicyRef[]> | null>(null);
  return useMemo(() => {
    // Editor-only server: no policies, so no badges - and a shared empty map
    // keeps every memoized consumer bailing out.
    if (!processorEnabled) return NO_BADGES;
    const labelById = new Map(
      loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
    );
    const map = reusePolicyBadgeArrays(
      previous.current,
      buildPolicyBadgeMap(runs, fileStubs, labelById),
    );
    previous.current = map;
    return map;
  }, [processorEnabled, runs, fileStubs]);
}
