// The encrypted bytes and password of PDFs as uploaded, sent instead of an unlocked re-save that
// would break their signatures. Memory only: never persisted, logged or put in tool parameters.

/** Why the workbench file's original bytes and password are known. */
export type LockedDocumentOrigin =
  /** The unlock prompt replaced the upload; `source` is the encrypted upload it re-saved. */
  | "unlocked"
  /** Still locked, and the user typed its password into a tool. */
  | "entered"
  /** Still locked: an append tool's output, encrypted with its source's password. */
  | "appended";

export interface LockedDocumentAccess {
  /** The encrypted bytes to send in place of the workbench file. */
  source: File;
  password: string;
  origin: LockedDocumentOrigin;
}

const entries = new Map<string, LockedDocumentAccess>();
/** Files whose typed password the server refused, until a new one is typed. */
const rejected = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version++;
  for (const listener of listeners) listener();
}

/** Records how to open `fileId`, the exact workbench version it applies to. */
export function setLockedDocumentAccess(
  fileId: string,
  access: LockedDocumentAccess,
): void {
  entries.set(fileId, access);
  rejected.delete(fileId);
  changed();
}

/** Drops a typed password the server refused, so the tool asks again and says why. */
export function rejectLockedDocumentPassword(fileId: string): void {
  if (entries.get(fileId)?.origin !== "entered") return;
  entries.delete(fileId);
  rejected.add(fileId);
  changed();
}

export function isLockedDocumentPasswordRejected(fileId: string): boolean {
  return rejected.has(fileId);
}

export function getLockedDocumentAccess(
  fileId: string,
): LockedDocumentAccess | undefined {
  return entries.get(fileId);
}

export function forgetLockedDocumentAccess(fileId: string): void {
  if (entries.delete(fileId)) changed();
}

/** Forgets every version that has left the workbench (removed, undone or edited on). */
export function retainLockedDocumentAccess(
  liveFileIds: readonly string[],
): void {
  const live = new Set(liveFileIds);
  let removed = false;
  for (const id of rejected) {
    if (!live.has(id)) {
      rejected.delete(id);
      removed = true;
    }
  }
  for (const id of entries.keys()) {
    if (!live.has(id)) {
      entries.delete(id);
      removed = true;
    }
  }
  if (removed) changed();
}

export function clearLockedDocumentAccess(): void {
  if (entries.size === 0 && rejected.size === 0) return;
  entries.clear();
  rejected.clear();
  changed();
}

/** For useSyncExternalStore: the listener runs after every change. */
export function subscribeLockedDocumentAccess(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Bumped on every change, so React can tell a new snapshot from an old one. */
export function getLockedDocumentAccessVersion(): number {
  return version;
}

/** The file and `documentPassword` to send for `file` to see or append to it as uploaded. */
export function lockedDocumentRequest(file: File & { fileId: string }): {
  file: File;
  documentPassword?: string;
} {
  const access = entries.get(file.fileId);
  return access
    ? { file: access.source, documentPassword: access.password }
    : { file };
}
