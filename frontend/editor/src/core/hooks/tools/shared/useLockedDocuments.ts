import { useSyncExternalStore } from "react";
import { useFileContext } from "@app/contexts/file/fileHooks";
import {
  getLockedDocumentAccess,
  getLockedDocumentAccessVersion,
  isLockedDocumentPasswordRejected,
  subscribeLockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";
import type { FileId, StirlingFile } from "@app/types/fileContext";

/**
 * How a tool treats a locked PDF. "audit" tools read it; "append" tools add a signature to it and
 * return a result that is still locked with the same password.
 */
export type LockedDocumentMode = "audit" | "append";

export interface LockedDocumentSummary {
  /** Unlocked copies that go out as the locked file the user uploaded. */
  usingOriginal: StirlingFile[];
  /** Still locked, with no password but the one typed into the tool. */
  needsPassword: StirlingFile[];
  /** The password typed for every file in `needsPassword`, or "" when they differ or lack one. */
  enteredPassword: string;
  /** Every file that needs a password has one, so the tool can run. */
  ready: boolean;
  /** The server refused the last password typed for one of `needsPassword`. */
  passwordRejected: boolean;
}

/** Pure core of {@link useLockedDocuments}; `isLocked` says whether a file is still encrypted. */
export function summarizeLockedDocuments(
  files: readonly StirlingFile[],
  isLocked: (fileId: FileId) => boolean,
): LockedDocumentSummary {
  const usingOriginal: StirlingFile[] = [];
  const needsPassword: StirlingFile[] = [];
  for (const file of files) {
    const access = getLockedDocumentAccess(file.fileId);
    if (access?.origin === "unlocked") {
      usingOriginal.push(file);
    } else if (isLocked(file.fileId) && access?.origin !== "appended") {
      needsPassword.push(file);
    }
  }
  const entered = new Set(
    needsPassword.map(
      (file) => getLockedDocumentAccess(file.fileId)?.password ?? "",
    ),
  );
  const enteredPassword = entered.size === 1 ? [...entered][0] : "";
  return {
    usingOriginal,
    needsPassword,
    enteredPassword,
    ready: needsPassword.every(
      (file) => !!getLockedDocumentAccess(file.fileId)?.password,
    ),
    passwordRejected: needsPassword.some((file) =>
      isLockedDocumentPasswordRejected(file.fileId),
    ),
  };
}

/** Which of `files` a locked-document tool swaps for their original, and which need a password. */
export function useLockedDocuments(
  files: readonly StirlingFile[],
): LockedDocumentSummary {
  const { selectors } = useFileContext();
  // Subscribed only to re-render on a change; the summary reads the store directly.
  useSyncExternalStore(
    subscribeLockedDocumentAccess,
    getLockedDocumentAccessVersion,
    getLockedDocumentAccessVersion,
  );
  return summarizeLockedDocuments(
    files,
    (fileId) =>
      selectors.getStirlingFileStub(fileId)?.processedFile?.isEncrypted ===
      true,
  );
}
