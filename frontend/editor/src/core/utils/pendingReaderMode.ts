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
