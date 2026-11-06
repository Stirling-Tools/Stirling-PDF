/**
 * Marks that the buyer has just bought Team, so the editor they are sent to can offer to invite
 * their team once. localStorage rather than state: billing and the editor are separate route trees,
 * and the hand-off crosses a navigation.
 */
const KEY = "stirling-team-welcome";

/** Long enough to survive the navigation; short enough that a stale mark never greets a later visit. */
const TTL_MS = 10 * 60 * 1000;

/** StrictMode replays effects; a second read in the same visit must not lose the first. */
let taken: boolean | undefined;

export function markTeamWelcome(): void {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
    taken = undefined;
  } catch {
    // Private browsing or a full quota: the editor simply opens without the prompt.
  }
}

/** Whether a fresh mark is waiting. Consumes it, so the prompt shows once. */
export function takeTeamWelcome(): boolean {
  if (taken !== undefined) return taken;
  taken = read();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Unwritable store; nothing to remove.
  }
  return taken;
}

/** Forgets the mark for the rest of this page load, once the buyer has acted on it. */
export function dismissTeamWelcome(): void {
  taken = false;
}

function read(): boolean {
  try {
    const at = Number(window.localStorage.getItem(KEY));
    return at > 0 && Date.now() - at < TTL_MS;
  } catch {
    return false;
  }
}

/** Test seam: forget that this page load already took the mark. */
export function resetTeamWelcomeForTests(): void {
  taken = undefined;
}
