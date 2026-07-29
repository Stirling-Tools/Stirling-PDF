/**
 * Review gate: blocks a document from leaving the app while a policy run on it
 * has failed and not been reviewed.
 *
 * Lives in a service, not a hook, because the export paths it guards include
 * plain functions (the download and save services) that cannot call hooks.
 * Callers await {@link requestReviewClearance}; a mounted host renders the
 * modal and resolves the promise. With no host mounted the gate is inert, so a
 * headless context can never deadlock waiting on a modal that cannot render.
 */

/** Export-type actions the gate can name in its prompt. */
export type ExportVerb = "download" | "save" | "print" | "share";

export interface ReviewGateRequest {
  /** Files needing review, already filtered from the caller's targets. */
  fileIds: string[];
  verb: ExportVerb;
}

/**
 * What a caller is exporting: one file id, several, or none at all (a download
 * with no id behind it). Callers pass whatever they have, so no site needs its
 * own ternary or filter to reach an array.
 */
export type ClearanceTarget =
  | string
  | null
  | undefined
  | readonly (string | null | undefined)[];

/** Supplied by the host, which can read the per-file policy badge map. */
type NeedsReviewResolver = (fileIds: string[]) => string[];

// The module-level state below is deliberate: this module is a browser-side
// app singleton (one gate per tab), not request-scoped logic. The resolver's
// lifetime is the host component's — registered on mount, cleared on unmount —
// and `pending` is the one open prompt, cleared the moment it's answered.
// Nothing here persists per-file or per-export state; tests reset via
// resetReviewGate().
let resolveNeedsReview: NeedsReviewResolver | null = null;
// Ids the user has just cleared for an export that is still running, so the
// chokepoints inside it don't ask again (a batch prompts once). Restored by
// {@link withReviewClearance} when its action settles; if concurrent exports
// interleave, the loser simply prompts again rather than skipping the gate.
let clearedScope: ReadonlySet<string> | null = null;
// `request` is stored as one stable object: useSyncExternalStore compares
// snapshots by identity, so building a fresh one per read would never settle.
let pending: {
  request: ReviewGateRequest;
  settle: (proceed: boolean) => void;
} | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Register the host's "which of these need review" lookup. Returns an
 * unregister function; the last host to mount wins.
 */
export function registerNeedsReviewResolver(
  resolver: NeedsReviewResolver,
): () => void {
  resolveNeedsReview = resolver;
  return () => {
    if (resolveNeedsReview === resolver) resolveNeedsReview = null;
  };
}

/**
 * Resolves true when the export may proceed: either nothing needs review, no
 * host is mounted to ask, or the user chose to continue anyway.
 */
export function requestReviewClearance(
  target: ClearanceTarget,
  verb: ExportVerb,
): Promise<boolean> {
  const ids = (typeof target === "string" ? [target] : (target ?? [])).filter(
    (id): id is string => !!id,
  );
  const flagged = (resolveNeedsReview?.(ids) ?? []).filter(
    (id) => !clearedScope?.has(id),
  );
  if (flagged.length === 0) return Promise.resolve(true);
  // A second prompt while one is open would orphan the first; treat the
  // overlapping export as cancelled rather than stacking modals.
  if (pending) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = {
      request: { fileIds: flagged, verb },
      settle: (proceed) => {
        pending = null;
        emit();
        resolve(proceed);
      },
    };
    emit();
  });
}

/**
 * Prompt once, then run `action` with those files counted as cleared, so the
 * chokepoints it goes through (download, save, print) don't ask a second time.
 * Returns undefined when the user cancelled and the action never ran.
 *
 * `action` must return its promise, or the clearance ends before the export
 * it kicked off reaches a chokepoint.
 */
export async function withReviewClearance<T>(
  target: ClearanceTarget,
  verb: ExportVerb,
  action: () => T | Promise<T>,
): Promise<T | undefined> {
  if (!(await requestReviewClearance(target, verb))) return undefined;
  const ids = typeof target === "string" ? [target] : (target ?? []);
  const outer = clearedScope;
  clearedScope = new Set([
    ...(outer ?? []),
    ...ids.filter((id): id is string => !!id),
  ]);
  try {
    return await action();
  } finally {
    clearedScope = outer;
  }
}

/** Answer the open prompt. No-op when nothing is pending. */
export function settleReviewGate(proceed: boolean): void {
  pending?.settle(proceed);
}

export function subscribeReviewGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReviewGateRequest(): ReviewGateRequest | null {
  return pending?.request ?? null;
}

/** Reset between tests. */
export function resetReviewGate(): void {
  pending = null;
  resolveNeedsReview = null;
  clearedScope = null;
  emit();
}
