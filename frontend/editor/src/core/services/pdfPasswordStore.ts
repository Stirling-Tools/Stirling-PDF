import type { FileId } from "@app/types/file";

/** Session-only access to encrypted bytes. Never serialize this object or include it in tool parameters. */
export interface PdfAccess {
  /** Local reads omit credential fingerprints and independent opening-password authentication. */
  localInspection?: boolean;
  password: string;
  openingPassword?: string;
  openingAuthenticated?: boolean;
  hasOwnerPassword?: boolean;
  encrypted: boolean;
  requiresOpeningPassword?: boolean;
  signed: boolean;
  ownerAuthenticated: boolean;
  /** Active instance policy; absent configuration defaults to enforcing restrictions. */
  honorOwnerPasswords?: boolean;
  permissions: number;
  /** Older servers omit these; native exports must reject unverifiable protection. */
  encryptionKeyLength?: number;
  encryptionRevision?: number;
  credentialFingerprint?: string;
  canModify: boolean;
  pageCount: number;
}

let accessByFile = new WeakMap<Blob, PdfAccess>();
let sessionLifetime = new AbortController();
let accessLifetimes = new WeakMap<
  Blob,
  { controller: AbortController; signal: AbortSignal }
>();
const filesById = new Map<string, WeakRef<Blob>>();
const listeners = new Set<() => void>();
let revision = 0;
/** Aborted by replacement, close or logout; also identifies the generation allowed to retain credentials. */
export function pdfAccessLifetime(file: Blob): AbortSignal {
  let lifetime = accessLifetimes.get(file);
  if (!lifetime) {
    const controller = new AbortController();
    lifetime = {
      controller,
      signal: AbortSignal.any([controller.signal, sessionLifetime.signal]),
    };
    accessLifetimes.set(file, lifetime);
  }
  return lifetime.signal;
}

/** Only call after a parser or a protection-preserving export proves these bytes unencrypted. */
export function rememberUnencryptedPdf(
  file: Blob,
  pageCount: number,
): PdfAccess {
  return rememberPdfAccess(file, {
    password: "",
    encrypted: false,
    signed: false,
    ownerAuthenticated: false,
    permissions: -4,
    canModify: true,
    pageCount,
  });
}

/** For viewer exports that cannot add encryption; arbitrary tool outputs must inspect their own bytes. */
export function rememberPlainPdfExport(source: Blob, output: Blob): void {
  const access = getPdfAccess(source);
  if (access?.encrypted === false)
    rememberUnencryptedPdf(output, access.pageCount);
}

function publish(): void {
  revision++;
  for (const listener of listeners) listener();
}

/** Look up credentials for these exact bytes; a replacement with the same filename must unlock separately. */
export function getPdfAccess(
  file: Blob | string | null | undefined,
): PdfAccess | undefined {
  if (!file) return undefined;
  const blob = typeof file === "string" ? filesById.get(file)?.deref() : file;
  return blob ? accessByFile.get(blob) : undefined;
}

/** Retain access without changing the file; returns the identity used by preview cleanup. */
export function rememberPdfAccess(file: Blob, access: PdfAccess): PdfAccess {
  const storedAccess = {
    ...access,
    openingPassword: access.encrypted
      ? access.openingAuthenticated || !access.ownerAuthenticated
        ? access.password
        : (access.openingPassword ?? accessByFile.get(file)?.openingPassword)
      : undefined,
  };
  accessByFile.set(file, storedAccess);
  if ("fileId" in file && typeof file.fileId === "string")
    filesById.set(file.fileId, new WeakRef(file));
  publish();
  return storedAccess;
}

/** Refresh local facts without discarding richer verification for the same bytes and credential. */
export function rememberLocalPdfAccess(
  file: Blob,
  access: PdfAccess,
): PdfAccess {
  const previous = getPdfAccess(file);
  return rememberPdfAccess(
    file,
    previous?.password === access.password
      ? {
          ...previous,
          ...access,
          localInspection: previous.localInspection,
          openingAuthenticated:
            previous.openingAuthenticated ?? access.openingAuthenticated,
          requiresOpeningPassword:
            previous.requiresOpeningPassword ?? access.requiresOpeningPassword,
        }
      : access,
  );
}

/** Bind FileContext identity without retaining closed/library-only bytes; replacements invalidate pending access. */
export function bindPdfAccess(file: Blob, id: FileId): void {
  const previous = filesById.get(id)?.deref();
  if (previous && previous !== file) {
    accessByFile.delete(previous);
    accessLifetimes.get(previous)?.controller.abort();
    accessLifetimes.delete(previous);
    filesById.delete(id);
  }
  filesById.set(id, new WeakRef(file));
  if (previous && previous !== file) publish();
}

/** Closing a document drops its credential; reopening requires authentication again. */
export function forgetPdfAccess(ids: readonly string[]): void {
  for (const id of ids) {
    const file = filesById.get(id)?.deref();
    if (file) {
      accessByFile.delete(file);
      accessLifetimes.get(file)?.controller.abort();
      accessLifetimes.delete(file);
    }
    filesById.delete(id);
  }
  publish();
}

/** Drop preview-owned access unless the same bytes have since entered FileContext. */
export function forgetPreviewPdfAccess(file: Blob, access: PdfAccess): void {
  if (
    accessByFile.get(file) !== access ||
    [...filesById.values()].some((ref) => ref.deref() === file)
  )
    return;
  accessByFile.delete(file);
  accessLifetimes.get(file)?.controller.abort();
  accessLifetimes.delete(file);
  publish();
}

/** Clear all credentials on logout or FileContext teardown. */
export function clearPdfAccess(): void {
  sessionLifetime.abort();
  sessionLifetime = new AbortController();
  accessLifetimes = new WeakMap();
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
