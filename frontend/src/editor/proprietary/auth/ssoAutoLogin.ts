/**
 * Per-tab bookkeeping that decides whether /login may send a visitor straight
 * to the single SSO provider. Lives in sessionStorage so a new tab starts over.
 *
 * Every access is guarded: a browser that blocks storage throws on the first
 * touch of `window.sessionStorage`, and a full one throws on write. State that
 * cannot be read or recorded fails towards showing the sign-in form, because
 * without the visit count nothing stops a redirect loop through a broken IdP.
 */

const ATTEMPTS_KEY = "stirling_sso_auto_login_attempts";
const ERRORS_KEY = "stirling_sso_auto_login_errors";
// Must match the key signOut() and the accountLogout extensions set.
const LOGGED_OUT_KEY = "stirling_sso_auto_login_logged_out";

// One redirect per tab: landing on /login again without having signed in means
// the IdP round trip is not working for this visitor, so they get the form.
const MAX_ATTEMPTS = 1;
const MAX_ERRORS = 1;

function readCount(storage: Storage, key: string): number {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) ? value : 0;
}

function incrementCount(key: string): boolean {
  try {
    const storage = window.sessionStorage;
    storage.setItem(key, String(readCount(storage, key) + 1));
    return true;
  } catch {
    return false;
  }
}

/** False when this tab has used its redirect, hit an SSO error, signed out, or cannot read storage. */
export function isSsoAutoLoginAllowed(): boolean {
  try {
    const storage = window.sessionStorage;
    return (
      readCount(storage, ATTEMPTS_KEY) < MAX_ATTEMPTS &&
      readCount(storage, ERRORS_KEY) < MAX_ERRORS &&
      storage.getItem(LOGGED_OUT_KEY) !== "1"
    );
  } catch {
    return false;
  }
}

/**
 * Counts this tab's redirect. False when it could not be stored, and the caller
 * must not redirect: the next view would not know this one happened.
 */
export function recordSsoAutoLoginAttempt(): boolean {
  return incrementCount(ATTEMPTS_KEY);
}

export function recordSsoAutoLoginError(): void {
  // Safe to drop on failure: storage that rejects this write rejects the
  // attempt count too, and Login does not redirect without one.
  incrementCount(ERRORS_KEY);
}

/** Restores the redirect after a completed sign-in. */
export function resetSsoAutoLoginCounts(): void {
  try {
    window.sessionStorage.removeItem(ATTEMPTS_KEY);
    window.sessionStorage.removeItem(ERRORS_KEY);
  } catch {
    // Storage blocked: there are no counts to reset.
  }
}

export function clearSignedOutFlag(): void {
  try {
    window.sessionStorage.removeItem(LOGGED_OUT_KEY);
  } catch {
    // Storage blocked: the flag was never set.
  }
}

/**
 * Whether the user signed out in this tab. False when storage is unreadable,
 * so a completed SSO round trip is never thrown away over a missing flag.
 */
export function hasSignedOutInThisTab(): boolean {
  try {
    return window.sessionStorage.getItem(LOGGED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}
