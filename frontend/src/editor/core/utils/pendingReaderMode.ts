let pending = false;

/** Carries "open in reading mode" across an app switch, and deliberately not a reload. */
export function requestReaderMode(): void {
  pending = true;
}

/** True once per request. */
export function consumeReaderModeRequest(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}

let fromPreference = false;

/**
 * Marks reading as opened by the startup-view preference rather than by a click,
 * so the path that follows replaces the entry the app loaded on. Pushing it would
 * put reading behind the first Back press of every session that prefers it.
 */
export function markReaderModeFromPreference(): void {
  fromPreference = true;
}

/** True once per marked open. */
export function consumeReaderModeFromPreference(): boolean {
  if (!fromPreference) return false;
  fromPreference = false;
  return true;
}
