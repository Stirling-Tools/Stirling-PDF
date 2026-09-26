/**
 * The viewer registers how to ask the open engine document about its form,
 * attachment and layer content, so callers that only hold the file get the
 * worker's answer instead of reading the document on the main thread. The
 * engine document id arrives only after the open completes, so callers wait for
 * it and read the bytes when no id comes or the worker cannot answer.
 *
 * Callers may hold a different Blob object for the same file (a StirlingFile
 * and its inner File), so registrations are also indexed by content key.
 */
import { documentFileKey } from "@app/services/documentBytesCache";

export interface EngineDocumentProbe {
  formType: number;
  attachmentCount: number | null;
}

type EngineProbeRunner = (documentId: string) => Promise<EngineDocumentProbe>;
type EngineLayerRunner = (documentId: string) => Promise<boolean | null>;

interface RegisteredRunner {
  engine: unknown;
  probe: EngineProbeRunner;
  layerProbe: EngineLayerRunner;
}

interface PendingOpen {
  promise: Promise<string | null>;
  resolve: (documentId: string | null) => void;
}

const KEY_ENTRY_LIMIT = 64;

const runners = new WeakMap<Blob, RegisteredRunner>();
const documentIds = new WeakMap<Blob, string>();
const pendingOpens = new WeakMap<Blob, PendingOpen>();
const answers = new WeakMap<Blob, Promise<EngineDocumentProbe | null>>();
const layerAnswers = new WeakMap<Blob, Promise<boolean | null>>();

const runnersByKey = new Map<string, RegisteredRunner>();
const idsByKey = new Map<string, string>();
const pendingOpensByKey = new Map<string, PendingOpen>();
const answersByKey = new Map<string, Promise<EngineDocumentProbe | null>>();
const layerAnswersByKey = new Map<string, Promise<boolean | null>>();

function createPendingOpen(): PendingOpen {
  let resolve!: (documentId: string | null) => void;
  const promise = new Promise<string | null>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Bumped whenever keyed state is cleared, so a publish that started before the
 *  clear cannot land afterwards with a stale answer. */
let cacheGeneration = 0;

function clearKeyedAnswers(key: string): void {
  answersByKey.delete(key);
  layerAnswersByKey.delete(key);
  idsByKey.delete(key);
  cacheGeneration += 1;
}

function trim<T>(map: Map<string, T>): void {
  while (map.size > KEY_ENTRY_LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Registers the probe runners for a source. Runs on every render, so it must
 *  stay idempotent; a fresh open, or a new engine after a remount, clears the
 *  memoized answers instead. */
export function registerEngineDocumentProbe(
  source: Blob,
  engine: unknown,
  probe: EngineProbeRunner,
  layerProbe: EngineLayerRunner,
): void {
  const engineChanged = runners.get(source)?.engine !== engine;
  invalidateEngineDocumentProbe(source);
  if (engineChanged) {
    // The old engine's document id must not be handed to the new runner; the
    // next open resolves a fresh one.
    documentIds.delete(source);
  }
  runners.set(source, { engine, probe, layerProbe });
  void documentFileKey(source).then((key) => {
    if (!key) return;
    if (runnersByKey.get(key)?.engine !== engine) {
      clearKeyedAnswers(key);
    }
    runnersByKey.set(key, { engine, probe, layerProbe });
    trim(runnersByKey);
  });
}

/** Marks that the viewer is opening this source, so callers wait for its
 *  document id instead of reading the bytes while the open is in flight. */
export function beginEngineDocumentOpen(source: Blob): void {
  if (!documentIds.has(source) && !pendingOpens.has(source)) {
    pendingOpens.set(source, createPendingOpen());
  }
  void documentFileKey(source).then((key) => {
    if (!key || idsByKey.has(key) || pendingOpensByKey.has(key)) return;
    pendingOpensByKey.set(key, createPendingOpen());
    trim(pendingOpensByKey);
  });
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
  void documentFileKey(source).then((key) => {
    if (!key) return;
    if (documentId) {
      idsByKey.set(key, documentId);
      trim(idsByKey);
    }
    pendingOpensByKey.get(key)?.resolve(documentId);
    pendingOpensByKey.delete(key);
    clearKeyedAnswers(key);
  });
}

/** Drops the memoized answers, e.g. when a document is reopened after a failed
 *  probe, so the next caller asks the worker again. */
export function invalidateEngineDocumentProbe(source: Blob): void {
  answers.delete(source);
  layerAnswers.delete(source);
  cacheGeneration += 1;
  void documentFileKey(source).then((key) => {
    if (key) clearKeyedAnswers(key);
  });
}

async function documentIdFor(source: Blob): Promise<string | null> {
  const known = documentIds.get(source);
  if (known) return known;
  const pending = pendingOpens.get(source);
  if (pending) return pending.promise;
  const key = await documentFileKey(source);
  if (!key) return null;
  const keyedId = idsByKey.get(key);
  if (keyedId) return keyedId;
  const keyedPending = pendingOpensByKey.get(key);
  if (keyedPending) return keyedPending.promise;
  return null;
}

function runOnce<T>(
  source: Blob,
  memo: WeakMap<Blob, Promise<T>>,
  keyedMemo: Map<string, Promise<T>>,
  pick: (runner: RegisteredRunner) => (documentId: string) => Promise<T>,
  fallback: T,
): Promise<T> {
  const existing = memo.get(source);
  if (existing) return existing;
  const generation = cacheGeneration;
  const answer = (async (): Promise<T> => {
    const key = await documentFileKey(source);
    const cached = key ? keyedMemo.get(key) : undefined;
    if (cached) return cached;
    const runner =
      runners.get(source) ?? (key ? runnersByKey.get(key) : undefined);
    if (!runner) return fallback;
    const documentId = await documentIdFor(source);
    if (!documentId) return fallback;
    return pick(runner)(documentId);
  })().catch(() => fallback);
  memo.set(source, answer);
  void documentFileKey(source).then((key) => {
    if (!key || cacheGeneration !== generation) return;
    if (!keyedMemo.has(key)) keyedMemo.set(key, answer);
  });
  return answer;
}

/** Runs the worker probe once per document; null means the caller reads. */
export function runEngineDocumentProbe(
  source: Blob,
): Promise<EngineDocumentProbe | null> {
  return runOnce(source, answers, answersByKey, (runner) => runner.probe, null);
}

/** Exact layer answer from the worker, or null when it cannot decide and the
 *  caller parses the document instead. */
export function runEngineDocumentLayerVerdict(
  source: Blob,
): Promise<boolean | null> {
  return runOnce(
    source,
    layerAnswers,
    layerAnswersByKey,
    (runner) => runner.layerProbe,
    null,
  );
}
