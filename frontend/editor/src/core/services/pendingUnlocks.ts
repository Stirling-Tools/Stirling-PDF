/**
 * The uploads still waiting on their unlock prompt. Published by the workbench, read by anything
 * that would otherwise act on a document the user is in the middle of decrypting.
 *
 * A module store rather than context: the reader is a policy hook in another layer, and it needs
 * the answer during an effect rather than as a render input.
 */

const pending = new Set<string>();
const listeners = new Set<() => void>();

/** Replaces the set wholesale, since the prompt queue is authoritative about who is waiting. */
export function setPendingUnlocks(fileIds: readonly string[]): void {
  const next = new Set(fileIds);
  if (next.size === pending.size && [...next].every((id) => pending.has(id))) {
    return;
  }
  pending.clear();
  for (const id of next) pending.add(id);
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Whether this document is still awaiting an unlock decision. False once the user has unlocked it
 * (the document is replaced by a decrypted version) or skipped it (they have chosen to go on).
 */
export function isAwaitingUnlock(fileId: string): boolean {
  return pending.has(fileId);
}

let version = 0;

/** Changes whenever the set does, so a subscriber can re-run work it skipped. */
export function pendingUnlocksVersion(): number {
  return version;
}

export function subscribeToPendingUnlocks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
