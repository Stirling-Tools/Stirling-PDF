/**
 * The viewer registers how to ask the open engine document about its form,
 * attachment and layer content, so callers that only hold the file get the
 * worker's answer instead of reading the document on the main thread. The
 * engine document id arrives only after the open completes, so callers wait for
 * it and read the bytes when no id comes or the worker cannot answer.
 */
export interface EngineDocumentProbe {
  formType: number;
  attachmentCount: number | null;
}

type EngineProbeRunner = (documentId: string) => Promise<EngineDocumentProbe>;
type EngineLayerRunner = (documentId: string) => Promise<boolean | null>;

interface PendingOpen {
  promise: Promise<string | null>;
  resolve: (documentId: string | null) => void;
}

const probes = new WeakMap<Blob, EngineProbeRunner>();
const registeredEngines = new WeakMap<Blob, unknown>();
const layerProbes = new WeakMap<Blob, EngineLayerRunner>();
const documentIds = new WeakMap<Blob, string>();
const pendingOpens = new WeakMap<Blob, PendingOpen>();
const answers = new WeakMap<Blob, Promise<EngineDocumentProbe | null>>();
const layerAnswers = new WeakMap<Blob, Promise<boolean | null>>();

/** Registers the probe runners for a source. Runs on every render, so it must
 *  stay idempotent; a fresh open, or a new engine after a remount, clears the
 *  memoized answers instead. */
export function registerEngineDocumentProbe(
  source: Blob,
  engine: unknown,
  probe: EngineProbeRunner,
  layerProbe: EngineLayerRunner,
): void {
  if (registeredEngines.get(source) !== engine) {
    registeredEngines.set(source, engine);
    invalidateEngineDocumentProbe(source);
  }
  probes.set(source, probe);
  layerProbes.set(source, layerProbe);
}

/** Marks that the viewer is opening this source, so callers wait for its
 *  document id instead of reading the bytes while the open is in flight. */
export function beginEngineDocumentOpen(source: Blob): void {
  if (documentIds.has(source) || pendingOpens.has(source)) return;
  let resolve!: (documentId: string | null) => void;
  const promise = new Promise<string | null>((res) => {
    resolve = res;
  });
  pendingOpens.set(source, { promise, resolve });
}

/** Records the active document id once the open and its activation succeeded,
 *  or null when the open failed, was skipped or the engine is gone. */
export function resolveEngineDocumentOpen(
  source: Blob,
  documentId: string | null,
): void {
  if (documentId) documentIds.set(source, documentId);
  pendingOpens.get(source)?.resolve(documentId);
  pendingOpens.delete(source);
  invalidateEngineDocumentProbe(source);
}

/** Drops the memoized answers, e.g. when a document is reopened after a failed
 *  probe, so the next caller asks the worker again. */
export function invalidateEngineDocumentProbe(source: Blob): void {
  answers.delete(source);
  layerAnswers.delete(source);
}

async function documentIdFor(source: Blob): Promise<string | null> {
  const known = documentIds.get(source);
  if (known) return known;
  const pending = pendingOpens.get(source);
  if (pending) return pending.promise;
  return null;
}

function runOnce<T>(
  source: Blob,
  memo: WeakMap<Blob, Promise<T>>,
  runner: ((documentId: string) => Promise<T>) | undefined,
  fallback: T,
): Promise<T> {
  const existing = memo.get(source);
  if (existing) return existing;
  // Without a runner nothing is memoized, so a later registration can answer.
  if (!runner) return Promise.resolve(fallback);
  const answer = (async () => {
    const documentId = await documentIdFor(source);
    return documentId ? runner(documentId) : fallback;
  })().catch(() => fallback);
  memo.set(source, answer);
  return answer;
}

/** Runs the worker probe once per document; null means the caller reads. */
export function runEngineDocumentProbe(
  source: Blob,
): Promise<EngineDocumentProbe | null> {
  return runOnce(source, answers, probes.get(source), null);
}

/** Exact layer answer from the worker, or null when it cannot decide and the
 *  caller parses the document instead. */
export function runEngineDocumentLayerVerdict(
  source: Blob,
): Promise<boolean | null> {
  return runOnce(source, layerAnswers, layerProbes.get(source), null);
}
