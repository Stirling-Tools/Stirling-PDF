const KEY = "stirling.appSwap";

/**
 * Records that the user is deliberately switching between the editor and the
 * processor, so the quick nav rail on the other side knows to play its swap
 * animation as it arrives.
 *
 * Switching tears down one app's React tree and mounts the other's, so the
 * animation cannot be a transition on a living element - the flag is how the
 * intent survives the remount. sessionStorage rather than a module variable
 * because a cross-origin editor URL reloads the page instead of routing.
 */
export function markAppSwap(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // private mode / quota: the switch still works, it just won't animate
  }
}

/** True once per recorded switch; clears the record so a reload doesn't replay. */
export function consumeAppSwap(): boolean {
  try {
    if (window.sessionStorage.getItem(KEY) === null) return false;
    window.sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
