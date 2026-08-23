// The tab's last editor session (open files, selection, view), so a processor switch or reload
// does not cost the user their workbench. sessionStorage on purpose: per-tab, tabs never clobber.

import type { StirlingFileStub } from "@app/types/fileContext";

const SESSION_KEY = "stirling.workbench.session";
const RETURN_PATH_KEY = "stirling.workbench.editorReturnPath";

// All ids are ORIGINAL file ids - a file's stable identity across versions.
export interface WorkbenchSession {
  fileIds: string[];
  selectedFileIds: string[];
  /** Which view was on screen. Absent for a record written before this was tracked. */
  workbench?: string;
  activeFileId?: string;
}

/** A file's stable identity across versions - what the session records. */
export function originalIdOf(stub: StirlingFileStub): string {
  return stub.originalFileId || (stub.id as string);
}

export function readWorkbenchSession(): WorkbenchSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkbenchSession>;
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
    };
  } catch {
    return null;
  }
}

export function writeWorkbenchSession(session: WorkbenchSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage refused (quota, privacy mode): the session just won't survive.
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
