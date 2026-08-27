let pending = false;

/**
 * Asks the editor to open in reading mode, for a switch that starts outside it.
 *
 * The processor's rail can't turn the mode on itself - the editor owns it, and
 * isn't mounted yet - and the mode deliberately isn't in the URL, so there is no
 * address to carry the intent. Hence a one-shot flag.
 *
 * A module variable, not sessionStorage: switching apps is a route change within
 * the same page, so this survives it, while a reload wipes it - which is what we
 * want. Persisting it would make every later reload of that tab open in reading
 * mode, and would leak into new tabs opened from this one.
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
