/**
 * Whether the app is backed by a server that serves the non-core API surface —
 * policies, processing folders, the AI engine.
 *
 * Always true here: a web build is served by the very backend that answers those
 * calls. Builds whose bundled backend cannot serve them shadow this file.
 */
export function useConnectedServer(): boolean {
  return true;
}
