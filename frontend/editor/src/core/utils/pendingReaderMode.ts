let pending = false;

/**
 * Carries "open in reading mode" across an app switch, the editor not being mounted
 * yet and the mode not being in the URL. A module variable, not sessionStorage: it
 * survives the route change but not a reload, which is the point.
 */
export function requestReaderMode(): void {
  pending = true;
}

/** True once per request. */
export function consumeReaderModeRequest(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}
