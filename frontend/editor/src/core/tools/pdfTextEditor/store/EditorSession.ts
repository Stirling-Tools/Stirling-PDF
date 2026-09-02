import { useSyncExternalStore } from "react";
import type { FileId } from "@app/types/file";

/**
 * What the editor's canvas top bar needs from the tool panel.
 *
 * The two surfaces are siblings, not ancestor and descendant: the panel is the
 * tool, and the canvas is a workbench view registered by id and mounted
 * somewhere else entirely, so no React context reaches from one to the other.
 * They already share the EditorStore singleton for document state; this is the
 * same seam for the things only the panel can do - anything touching the
 * workbench's file list has to run where the FileContext is.
 */
export interface EditorSession {
  /** Name of the open document, or null before one is opened. */
  fileName: string | null;
  /** Workbench file the document came from; null for a file opened from disk. */
  fileId: FileId | null;
  /** Apply the edit back to the workbench file. */
  save: () => void;
  /** Apply, then hand the user a copy. */
  download: () => void;
  /** Open a different workbench PDF (asks first when there are unsaved edits). */
  pickFile: (file: File) => void;
  /** Open the OS file picker for a replacement image. */
  pickImage: () => void;
}

let current: EditorSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

/** Publish (or, with null, retract) the panel's session. */
export function setEditorSession(session: EditorSession | null): void {
  current = session;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): EditorSession | null {
  return current;
}

/**
 * The live session, or null while the panel is not mounted.
 *
 * A null session means the canvas is on its own - it must degrade to view-only
 * controls rather than render a Save button that cannot save.
 */
export function useEditorSession(): EditorSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
