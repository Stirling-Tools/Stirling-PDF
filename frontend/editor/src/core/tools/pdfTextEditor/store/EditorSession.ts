import { useSyncExternalStore } from "react";
import type { FileId } from "@app/types/file";

// What the canvas top bar needs from the tool panel. They are siblings, not
// ancestor and descendant, so no React context reaches between them.
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

/** The live session, or null while the panel is not mounted. */
export function useEditorSession(): EditorSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
