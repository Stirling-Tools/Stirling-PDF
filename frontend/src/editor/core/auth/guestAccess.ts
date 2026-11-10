/**
 * Whether this server lets visitors use the tools without an account
 * (`security.allowAnonymousAccess`), and whether anyone is signed in right now.
 *
 * It lives outside React because the two facts come from opposite sides of the
 * provider tree: the config is fetched *inside* AppConfigProvider, while the
 * auth session is decided *above* it. A tiny external store lets both publish
 * and both subscribe without a second `/app-config` call.
 *
 * Guest mode is not a login: a real session always wins, and a stored JWT means
 * there may be one, so we never hand back a guest shell that would hide an
 * account the visitor actually has.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

const JWT_STORAGE_KEY = "stirling_jwt";

/** The server's answer: `security.enableLogin && security.allowAnonymousAccess`. */
let allowed = false;

/** Whether a session (or at least a stored token) is in play. */
let signedIn = false;

function storedTokenExists(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(JWT_STORAGE_KEY));
  } catch {
    // Storage blocked: assume a session, so a guest shell cannot mask one.
    return true;
  }
}

signedIn = storedTokenExists();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Called by AppConfigProvider whenever the server's answer arrives. */
export function setGuestAccessAllowed(next: boolean): void {
  const value = Boolean(next);
  if (value === allowed) return;
  allowed = value;
  emit();
}

export function isGuestAccessAllowed(): boolean {
  return allowed;
}

/**
 * Called by the auth provider once it knows whether a session exists. Signing in
 * always clears guest mode; signing out (or a token turning out to be dead)
 * returns the visitor to the guest shell when the server allows it.
 */
export function setGuestSignedIn(next: boolean): void {
  const value = Boolean(next);
  if (value === signedIn) return;
  signedIn = value;
  emit();
}

/** True when the UI should behave as a guest: guests are allowed and nobody is signed in. */
export function isGuestActive(): boolean {
  return allowed && !signedIn;
}

export function subscribeGuestAccess(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot for `useSyncExternalStore`; the boolean is the whole state. */
export function getGuestAccessSnapshot(): boolean {
  return isGuestActive();
}

/** Server-render / no-DOM snapshot: never a guest. */
export function getGuestAccessServerSnapshot(): boolean {
  return false;
}
