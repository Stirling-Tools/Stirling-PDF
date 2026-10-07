import type { FileId } from "@app/types/file";

/** Session-only access to encrypted bytes. Never serialize this object or include it in tool parameters. */
export interface PdfAccess {
  password: string;
  encrypted: boolean;
  signed: boolean;
  ownerAuthenticated: boolean;
  permissions: number;
  canModify: boolean;
  canAssemble: boolean;
  pageCount: number;
}

let accessByFile = new WeakMap<Blob, PdfAccess>();
const filesById = new Map<string, Blob>();
const listeners = new Set<() => void>();
let revision = 0;

function publish(): void {
  revision++;
  for (const listener of listeners) listener();
}

/** Look up credentials for these exact bytes; a replacement with the same filename must unlock separately. */
export function getPdfAccess(
  file: Blob | string | null | undefined,
): PdfAccess | undefined {
  if (!file) return undefined;
  const blob = typeof file === "string" ? filesById.get(file) : file;
  return blob ? accessByFile.get(blob) : undefined;
}

/** Retain access for the current session, without changing the original file. */
export function rememberPdfAccess(file: Blob, access: PdfAccess): void {
  accessByFile.set(file, access);
  if ("fileId" in file && typeof file.fileId === "string")
    filesById.set(file.fileId, file);
  publish();
}

/** Bind a newly assigned FileContext identity to credentials already attached to its bytes. */
export function bindPdfAccess(file: Blob, id: FileId): void {
  const previous = filesById.get(id);
  if (previous && previous !== file) {
    accessByFile.delete(previous);
    filesById.delete(id);
  }
  if (accessByFile.has(file)) filesById.set(id, file);
}

/** Closing a document drops its credential; reopening requires authentication again. */
export function forgetPdfAccess(ids: readonly string[]): void {
  for (const id of ids) {
    const file = filesById.get(id);
    if (file) accessByFile.delete(file);
    filesById.delete(id);
  }
  publish();
}

/** Clear all credentials on logout or FileContext teardown. */
export function clearPdfAccess(): void {
  accessByFile = new WeakMap();
  filesById.clear();
  publish();
}

/** Subscribe to unlock/lock changes without exposing credentials in React state. */
export function subscribePdfAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic snapshot for useSyncExternalStore. */
export function pdfAccessRevision(): number {
  return revision;
}
