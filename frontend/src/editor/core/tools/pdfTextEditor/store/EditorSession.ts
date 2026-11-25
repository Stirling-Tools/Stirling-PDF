import { useSyncExternalStore } from "react";

export interface EditorSession {
  fileName: string | null;
  save: () => void;
  /**
   * Saves now for a document-wide setting, unsaved edits and all; a change made while
   * a save runs is saved once it ends, where save would skip it.
   */
  autosave: () => void;
  download: () => void;
  pickImage: () => void;
  /** Brings a page on screen, mounted or not. */
  revealPage: (pageIndex: number) => void;
}

let current: EditorSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

export function setEditorSession(session: EditorSession): void {
  current = session;
  emit();
}

/**
 * Clears `session` if it is still the current one. An editor unmounting after
 * another has mounted (leaving the text editor for a review) must not clear the
 * newcomer's session.
 */
export function clearEditorSession(session: EditorSession): void {
  if (current !== session) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): EditorSession | null {
  return current;
}

/** The session as it stands, for event handlers outside React's render. */
export function currentEditorSession(): EditorSession | null {
  return current;
}

export function useEditorSession(): EditorSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
