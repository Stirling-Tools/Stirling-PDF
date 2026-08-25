// The tab's last editor session (open files, selection, view), so a processor switch or reload
// does not cost the user their workbench. sessionStorage on purpose: per-tab, tabs never clobber.

import type { StirlingFileStub } from "@app/types/fileContext";

const SESSION_KEY = "stirling.workbench.session";
/** Bumped when the record's shape or meaning changes, so an old one is discarded rather than
 *  half-read. v2: `userId` became meaningful - v1 records were written without a real owner and
 *  would otherwise look like they belonged to an anonymous session forever. */
const SESSION_VERSION = 2;
const RETURN_PATH_KEY = "stirling.workbench.editorReturnPath";

// All ids are ORIGINAL file ids - a file's stable identity across versions.
export interface WorkbenchSession {
  fileIds: string[];
  selectedFileIds: string[];
  /** Which view was on screen. Absent for a record written before this was tracked. */
  workbench?: string;
  activeFileId?: string;
  /** Who the workbench belonged to, so the next person to use this tab does not inherit it. */
  userId?: string | null;
}

/** A file's stable identity across versions - what the session records. */
export function originalIdOf(stub: StirlingFileStub): string {
  return stub.originalFileId || (stub.id as string);
}

export function readWorkbenchSession(): WorkbenchSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkbenchSession> & {
      v?: number;
    };
    if (parsed.v !== SESSION_VERSION) return null;
    if (!Array.isArray(parsed.fileIds)) return null;
    return {
      fileIds: parsed.fileIds.filter((id) => typeof id === "string"),
      selectedFileIds: Array.isArray(parsed.selectedFileIds)
        ? parsed.selectedFileIds.filter((id) => typeof id === "string")
        : [],
      workbench:
        typeof parsed.workbench === "string" ? parsed.workbench : undefined,
      activeFileId:
        typeof parsed.activeFileId === "string"
          ? parsed.activeFileId
          : undefined,
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
    };
  } catch {
    return null;
  }
}

// Sign-out clears the record, but signing out also tears the editor down - and that teardown
// flushes the workbench one last time, recreating what we just deleted (with no user attached).
// So a sign-out has to stop writing too, not merely clear.
let writesSuspended = false;

/** Sign-out: drop the record and stop recording, so the teardown cannot put it back. */
export function suspendWorkbenchSession(): void {
  writesSuspended = true;
  clearWorkbenchSession();
}

/** A fresh editor mount is a new session, so recording starts again. */
export function resumeWorkbenchSession(): void {
  writesSuspended = false;
}

export function writeWorkbenchSession(session: WorkbenchSession): void {
  if (writesSuspended) return;
  try {
    // Never downgrade a known owner to "nobody". Signing out and a failed identity check both
    // read as no user, and dropping the owner would either hand the workbench to whoever signs
    // in next or lose it for the person it belongs to. Keeping the owner leaves the restore's
    // ownership check to decide, which it does with a settled identity.
    const owner = session.userId ?? readWorkbenchSession()?.userId ?? null;
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, userId: owner, v: SESSION_VERSION }),
    );
  } catch {
    // Storage refused (quota, privacy mode). setItem is atomic, so the PREVIOUS record would
    // survive and restore an older workbench - drop it, so the failure is "no restore" instead.
    clearWorkbenchSession();
  }
}

/** Drop the record: on sign-out, and whenever it would otherwise be restored for the wrong person. */
export function clearWorkbenchSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // A record we cannot remove is also one we cannot read.
  }
}

/** Views a restore may seed directly. "myFiles" is URL-owned (HomePage pins it to /files) and a
 *  custom view belongs to its tool - the editor return path restores those instead. */
const SEEDABLE_VIEWS = ["viewer", "fileEditor", "pageEditor"];

// Raised while a restore is applying its recorded view, so writers that pick a default view from
// whatever is loaded at the time defer to the restore rather than race it.
let applyingRestoredView = false;
let restoreGeneration = 0;

/** Returns a token for endRestoredView, so a stale release cannot end a newer restore. */
export function beginRestoredView(): number {
  applyingRestoredView = true;
  return ++restoreGeneration;
}

export function endRestoredView(token: number): void {
  if (token === restoreGeneration) applyingRestoredView = false;
}

export function isApplyingRestoredView(): boolean {
  return applyingRestoredView;
}

export function isSeedableView(
  view: string | undefined,
): view is "viewer" | "fileEditor" | "pageEditor" {
  return view !== undefined && SEEDABLE_VIEWS.includes(view);
}

export function saveEditorReturnPath(path: string): void {
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, path);
  } catch {
    // Best-effort: the switch back just lands on the editor root.
  }
}

/** One-shot: consumed by the switch back so a stale path cannot linger. */
export function takeEditorReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_PATH_KEY);
    if (path !== null) sessionStorage.removeItem(RETURN_PATH_KEY);
    return path;
  } catch {
    return null;
  }
}
