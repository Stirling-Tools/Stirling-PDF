let pending = false;

/**
 * Asks the editor to open in reading mode, for a switch that starts outside it. The
 * editor owns the mode and isn't mounted yet, and the mode isn't in the URL, so
 * there is nothing to carry the intent.
 *
 * A module variable, not sessionStorage: an app switch is a route change in the
 * same page so this survives it, while a reload clears it. Persisted, every later
 * reload of the tab would open in reading mode.
 */
export function requestReaderMode(): void {
  pending = true;
}

/** True once per request, then forgotten. */
export function consumeReaderModeRequest(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}
