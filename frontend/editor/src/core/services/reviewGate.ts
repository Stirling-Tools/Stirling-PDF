/**
 * Review gate: blocks a document from leaving the app while a policy run on it
 * has failed and not been reviewed.
 *
 * Lives in a service, not a hook, because the export paths it guards include
 * plain functions (download services, save-on-exit) that cannot call hooks.
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

/** Supplied by the host, which can read the per-file policy badge map. */
type NeedsReviewResolver = (fileIds: string[]) => string[];

let resolveNeedsReview: NeedsReviewResolver | null = null;
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
  fileIds: readonly string[],
  verb: ExportVerb,
): Promise<boolean> {
  const ids = fileIds.filter(Boolean) as string[];
  const flagged = resolveNeedsReview?.(ids) ?? [];
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
  emit();
}
