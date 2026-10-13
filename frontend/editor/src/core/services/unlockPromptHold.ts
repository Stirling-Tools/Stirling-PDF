/**
 * Keeps the upload-time unlock prompt from opening while a tool that verifies a document's
 * original bytes is mounted. Unlocking replaces the file with a re-saved copy, and a re-save drops
 * the signatures such a tool exists to check.
 *
 * A module store rather than context: FileContext sits above the tool providers, so it cannot
 * read their state.
 */

let holds = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Starts a hold and returns its release. Holds nest, so each caller releases only its own, and
 * releasing twice is harmless.
 */
export function holdUnlockPrompt(): () => void {
  holds += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    notify();
  };
}

export function isUnlockPromptHeld(): boolean {
  return holds > 0;
}

/** Fires on every change to the set of holds, including the last one being released. */
export function subscribeToUnlockPromptHold(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
