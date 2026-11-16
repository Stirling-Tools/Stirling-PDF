/**
 * Uploads whose damage check has not finished. Damage is only known once hydration has parsed a
 * file, which happens after the upload is published, so browser-side work that reads the file
 * waits for the check rather than failing on unparseable bytes.
 *
 * A module store rather than context, like pendingUnlocks: the readers are policy hooks in another
 * layer that need the answer during an effect.
 */

const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function publish(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Called before a file's hydration is scheduled, so no reader can observe it unchecked. Readers
 * test the pending set as they run, so only settling needs to wake them.
 */
export function beginDamageCheck(fileId: string): void {
  pending.add(fileId);
}

/** Every begun check must settle, including hydrations that end without metadata. */
export function settleDamageCheck(fileId: string): void {
  if (pending.delete(fileId)) publish();
}

export function isDamageCheckPending(fileId: string): boolean {
  return pending.has(fileId);
}

/** Changes whenever the pending set does, so a subscriber can re-run work it skipped. */
export function damageChecksVersion(): number {
  return version;
}

export function subscribeToDamageChecks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
