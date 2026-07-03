import {
  useMemo,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  usePolicyRuns,
  isRunInFlight,
} from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";
import { useAllFiles } from "@app/contexts/FileContext";
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
  orange: "var(--color-orange)",
};

/** Glyph size for the file-sidebar policy badge. */
const BADGE_ICON_SIZE = "0.7rem";

/** Reuse a policy category's own icon at badge size,
 * so each badge reflects its policy */
function toBadgeIcon(icon: ReactNode): ReactNode {
  return isValidElement(icon)
    ? cloneElement(icon as ReactElement<{ sx?: object }>, {
        sx: { fontSize: BADGE_ICON_SIZE },
      })
    : icon;
}

/** Minimal provenance shape needed to resolve a file's inherited badges. */
export type LineageStub = {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
};

/** Merge a ref into a list, deduping by policy id. */
function mergeRef(list: FileItemPolicyRef[], ref: FileItemPolicyRef): void {
  if (!list.some((p) => p.id === ref.id)) list.push(ref);
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
  iconById?: ReadonlyMap<string, ReactNode>,
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
          icon: iconById?.get(run.categoryId),
          accentColor: ACCENT_VAR[ROW_ACCENT[run.categoryId] ?? "blue"],
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

  return result;
}

/**
 * Policies currently working on each file, keyed by the run's INPUT fileId (the
 * file the run executes on, which is the row shown in the sidebar until the
 * tagged output is imported). Drives the file-row processing spinner. Runs are
 * newest-first in the store, so the first in-flight run per file wins (chained
 * policies run sequentially — at most one is in flight per file at a time).
 */
export function buildProcessingMap(
  runs: ReadonlyArray<PolicyRunRecord>,
  labelById: ReadonlyMap<string, string>,
  iconById?: ReadonlyMap<string, ReactNode>,
): Map<string, FileItemPolicyRef> {
  const result = new Map<string, FileItemPolicyRef>();
  for (const run of runs) {
    if (!isRunInFlight(run)) continue;
    if (result.has(run.fileId)) continue;
    const name = labelById.get(run.categoryId);
    if (!name) continue;
    result.set(run.fileId, {
      id: run.categoryId,
      name,
      icon: iconById?.get(run.categoryId),
      accentColor: ACCENT_VAR[ROW_ACCENT[run.categoryId] ?? "blue"],
    });
  }
  return result;
}

/**
 * Distinct policies that have produced each file, keyed by fileId, derived from
 * the reactive policy run store. Drives the file sidebar's shield badges. The
 * badge follows a document down its tool-edit chain — see
 * {@link buildPolicyBadgeMap}. Shadows the core stub via the {@code @app/*}
 * alias cascade.
 *
 * `extraStubs` lets a caller resolve lineage for files beyond the active
 * workspace — the Files sidebar passes its storage-backed stubs, so a CLOSED
 * file still inherits every policy in its chain (persisted records carry
 * parentFileId/sourceFileIds) instead of showing only the last direct badge.
 */
export function usePolicyFileBadges(
  extraStubs?: ReadonlyArray<LineageStub>,
): Map<string, FileItemPolicyRef[]> {
  const runs = usePolicyRuns();
  const { fileStubs } = useAllFiles();
  return useMemo(() => {
    const categories = loadPolicyCatalog().categories;
    const labelById = new Map(categories.map((c) => [c.id, c.label]));
    const iconById = new Map<string, ReactNode>(
      categories.map((c) => [c.id, toBadgeIcon(c.icon)]),
    );
    // Union workspace + caller stubs (dedupe by id, workspace wins — its
    // lineage is reducer-maintained and freshest).
    const byId = new Map<string, LineageStub>();
    for (const stub of extraStubs ?? []) byId.set(stub.id, stub);
    for (const stub of fileStubs) byId.set(stub.id as string, stub);
    return buildPolicyBadgeMap(runs, [...byId.values()], labelById, iconById);
  }, [runs, fileStubs, extraStubs]);
}

/**
 * The policy currently working on each file, keyed by fileId — drives the
 * file-row processing spinner. Derived from the reactive run store; see
 * {@link buildProcessingMap}. Shadows the core stub via the {@code @app/*}
 * alias cascade.
 */
export function usePolicyFileProcessing(): Map<string, FileItemPolicyRef> {
  const runs = usePolicyRuns();
  return useMemo(() => {
    const categories = loadPolicyCatalog().categories;
    const labelById = new Map(categories.map((c) => [c.id, c.label]));
    const iconById = new Map<string, ReactNode>(
      categories.map((c) => [c.id, toBadgeIcon(c.icon)]),
    );
    return buildProcessingMap(runs, labelById, iconById);
  }, [runs]);
}
