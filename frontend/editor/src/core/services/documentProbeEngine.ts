/**
 * The viewer registers how to ask the open engine document about its form and
 * layer content, so callers that only hold the file get the worker's answer
 * instead of reading the document on the main thread. Without a runner, or when
 * the worker cannot answer, callers read the bytes as before.
 */
export interface EngineDocumentProbe {
  formType: number;
  attachmentCount: number | null;
  hasLayers: boolean | null;
}

type EngineProbeRunner = () => Promise<EngineDocumentProbe | null>;

const runners = new WeakMap<Blob, EngineProbeRunner>();
const answers = new WeakMap<Blob, Promise<EngineDocumentProbe | null>>();

export function registerEngineDocumentProbe(
  source: Blob,
  runner: EngineProbeRunner,
): void {
  runners.set(source, runner);
}

/** Runs the worker probe once per document; a failed probe stays memoized as
 *  null so the callers fall back to reading instead of retrying per overlay. */
export function runEngineDocumentProbe(
  source: Blob,
): Promise<EngineDocumentProbe | null> {
  const existing = answers.get(source);
  if (existing) return existing;
  const runner = runners.get(source);
  if (!runner) return Promise.resolve(null);
  const answer = runner().catch(() => null);
  answers.set(source, answer);
  return answer;
}
