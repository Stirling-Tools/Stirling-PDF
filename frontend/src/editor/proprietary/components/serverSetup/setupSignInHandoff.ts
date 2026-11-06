// Set by the login page after its automatic default sign-in, so the app holds
// the sign-in card rather than flash the editor. Per tab; a display hint only.
const KEY = "stirling.setupSignInHandoff";

/** Past this the hint is stale, so the app is never held up for long. */
const MAX_HOLD_MS = 10_000;

export function markSetupSignIn(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Without storage the editor may show for a moment; nothing else changes.
  }
}

export function isSetupSignInPending(): boolean {
  try {
    const markedAt = Number(sessionStorage.getItem(KEY));
    return markedAt > 0 && Date.now() - markedAt < MAX_HOLD_MS;
  } catch {
    return false;
  }
}

export function clearSetupSignIn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
